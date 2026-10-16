"""An MCP client for KindRed's own MCP server (swapnet/mcp/server.py), so the coordinator agent discovers its tools and
calls them over the Model Context Protocol, like any other MCP client would.

The server runs as a child process over stdio. One session stays open in a background thread with its own event
loop, so the coordinator's plain (non-async) code can call `catalogue()` and `call()` without starting a process per
week. If the session drops it is started again on the next call."""
import asyncio
import json
import os
import sys
import threading
from pathlib import Path

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

BACKEND = Path(__file__).resolve().parents[2]


class McpError(RuntimeError):
    pass


class Client:
    def __init__(self):
        self._lock = threading.Lock()
        self._loop: asyncio.AbstractEventLoop | None = None
        self._session: ClientSession | None = None
        self._stop: asyncio.Event | None = None
        self._ready = threading.Event()
        self._error: BaseException | None = None
        self.tools: list = []
        self.server: str = ""

    def _alive(self) -> bool:
        return self._session is not None and self._loop is not None and self._loop.is_running()

    def start(self, timeout: float = 90) -> None:
        with self._lock:
            if self._alive():
                return
            self._ready.clear()
            self._error = None
            threading.Thread(target=self._run, name="kindred-mcp-client", daemon=True).start()
            if not self._ready.wait(timeout):
                raise McpError("the MCP server didn't start in time")
            if self._error:
                raise McpError(f"couldn't start the MCP server: {self._error}")

    def _run(self) -> None:
        self._loop = asyncio.new_event_loop()
        asyncio.set_event_loop(self._loop)
        try:
            self._loop.run_until_complete(self._serve())
        finally:
            self._session = None

    async def _serve(self) -> None:
        params = StdioServerParameters(command=sys.executable, args=["-m", "swapnet.mcp.server"], cwd=str(BACKEND),
                                       env={**os.environ, "KINDRED_WATCH": "0"})
        try:
            async with stdio_client(params) as (read, write):
                async with ClientSession(read, write) as session:
                    init = await session.initialize()
                    self.server = f"{init.serverInfo.name} {init.serverInfo.version}"
                    self.tools = (await session.list_tools()).tools
                    self._stop = asyncio.Event()
                    self._session = session
                    self._ready.set()
                    await self._stop.wait()
        except BaseException as e:  # startup failed, or the server went away
            self._error = e
            self._ready.set()

    def call(self, name: str, args: dict, timeout: float = 120) -> dict:
        """Call one MCP tool and return its result as a dict."""
        self.start()
        fut = asyncio.run_coroutine_threadsafe(self._session.call_tool(name, args), self._loop)
        try:
            res = fut.result(timeout)
        except Exception as e:
            self._session = None  # start a fresh session next time
            raise McpError(f"{name} over MCP failed: {type(e).__name__}") from e
        text = "".join(getattr(c, "text", "") for c in res.content or [])
        if res.isError:
            return {"error": text or f"{name} failed"}
        if isinstance(res.structuredContent, dict):
            out = res.structuredContent
            return out["result"] if set(out) == {"result"} and isinstance(out["result"], dict) else out
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            return {"text": text}

    def catalogue(self, prefix: str, hidden: tuple[str, ...] = ()) -> list[dict]:
        """The server's tools that start with `prefix`, as model tool definitions (name without the prefix, and
        without the arguments the caller fills in itself)."""
        self.start()
        out = []
        for t in self.tools:
            if not t.name.startswith(prefix):
                continue
            schema = json.loads(json.dumps(t.inputSchema or {"type": "object", "properties": {}}))
            for h in hidden:
                schema.get("properties", {}).pop(h, None)
            schema["required"] = [r for r in schema.get("required", []) if r not in hidden]
            schema.pop("title", None)
            for prop in schema.get("properties", {}).values():
                prop.pop("title", None)
            out.append({"name": t.name[len(prefix):], "description": (t.description or "").strip(), "input_schema": schema})
        return out


client = Client()

"""FalkorDB access. Every query is a named .cypher file so the UI can show exactly what ran.

Worlds: every visitor can have a private copy of the whole demo (one FalkorDB graph per tenant, the pattern the
FalkorDB docs recommend). The current world is a context variable; every graph name goes through `real()`, so the
shared demo keeps its graph names ("exchange", "hosp_hyd", ...) and a private copy uses "<world>__exchange" and so on.
Code never adds the prefix itself."""
import contextvars
import re
import threading
import time
from collections import deque

from falkordb import FalkorDB

from swapnet import config

_db = None
_lock = threading.Lock()
_ran: contextvars.ContextVar[list | None] = contextvars.ContextVar("ran", default=None)
_world: contextvars.ContextVar[str] = contextvars.ContextVar("world", default="")
# Every named query that ran in this process, newest last, for the "How it works" screen.
LOG: deque = deque(maxlen=500)


def db() -> FalkorDB:
    global _db
    if _db is None:
        _db = FalkorDB(**config.falkordb_args())
    return _db


def world() -> str:
    """The current world: "" for the shared demo, or a private copy's id."""
    return _world.get()


class in_world:
    """Run a block in one world: `with db.in_world("w7k2q"): ...`."""

    def __init__(self, w: str):
        self.w = w

    def __enter__(self):
        self._token = _world.set(self.w)
        return self

    def __exit__(self, *exc):
        _world.reset(self._token)


def set_world(w: str) -> None:
    """Set the world for the rest of this context (one API request)."""
    _world.set(w)


def real(graph: str) -> str:
    """The real FalkorDB graph name for a logical one ("exchange", "hosp_hyd", "mem_sunita") in the current world."""
    w = _world.get()
    return f"{w}__{graph}" if w else graph


def graphs() -> list[str]:
    """Logical names of the graphs that exist in the current world."""
    w = _world.get()
    all_ = db().list_graphs()
    if w:
        return [g[len(w) + 2:] for g in all_ if g.startswith(f"{w}__")]
    return [g for g in all_ if "__" not in g]


def exists(graph: str) -> bool:
    return real(graph) in db().list_graphs()


def drop(graph: str) -> None:
    _wrote(graph)
    if exists(graph):
        db().select_graph(real(graph)).delete()


def query_text(name: str) -> str:
    return (config.QUERIES / f"{name}.cypher").read_text(encoding="utf-8")


_WRITES = re.compile(r"\b(CREATE|MERGE|SET|DELETE|REMOVE)\b", re.IGNORECASE)


def is_read_only(name: str) -> bool:
    """A named query with no write clause. These run through GRAPH.RO_QUERY, so FalkorDB itself refuses
    any write from them, and the Ask agent can only reach queries that pass this check."""
    body = "\n".join(l for l in query_text(name).splitlines() if not l.strip().startswith("//"))
    return not _WRITES.search(body)


def all_queries() -> dict[str, str]:
    return {p.stem: p.read_text(encoding="utf-8") for p in sorted(config.QUERIES.glob("Q*.cypher"))}


_writes: dict[tuple[str, str], int] = {}


def _wrote(graph: str) -> None:
    key = (_world.get(), graph)
    _writes[key] = _writes.get(key, 0) + 1


def writes(graph: str = config.EXCHANGE) -> int:
    """How many writes this process has made to a graph of the current world: a cheap "has it changed" stamp for
    caching whole-pool reads (api/main.py). Writes from another process (the MCP server) aren't counted, so a cache
    keyed on this also expires after a couple of seconds."""
    return _writes.get((_world.get(), graph), 0)


def run(name: str, params: dict | None = None, graph: str = config.EXCHANGE) -> list[dict]:
    """Run a named query and return rows as dicts. Records the query and its latency."""
    text = query_text(name)
    ro = is_read_only(name)
    g = db().select_graph(real(graph))
    t0 = time.perf_counter()
    res = (g.ro_query if ro else g.query)(text, params or {})
    if not ro:
        _wrote(graph)
    ms = (time.perf_counter() - t0) * 1000
    entry = {"query": name, "graph": graph, "ms": round(ms, 2), "read_only": ro}
    LOG.append({**entry, "at": int(time.time() * 1000), "rows": len(res.result_set)})
    ran = _ran.get()
    if ran is not None:
        ran.append(entry)
    header = [h[1] if isinstance(h, (list, tuple)) else h for h in res.header]
    return [dict(zip(header, row)) for row in res.result_set]


def raw(cypher: str, params: dict | None = None, graph: str = config.EXCHANGE) -> list[dict]:
    """Small inline statements (setup, events). Analysis queries belong in named files."""
    res = db().select_graph(real(graph)).query(cypher, params or {})
    if _WRITES.search(cypher):
        _wrote(graph)
    header = [h[1] if isinstance(h, (list, tuple)) else h for h in res.header]
    return [dict(zip(header, row)) for row in res.result_set]


class track:
    """Collect which named queries ran inside a block: `with track() as q: ...; q.ran`."""

    def __enter__(self):
        self.ran: list[dict] = []
        self._token = _ran.set(self.ran)
        return self

    def __exit__(self, *exc):
        _ran.reset(self._token)


def setup_schema() -> None:
    db().config_set("RESULTSET_SIZE", -1)  # default caps results at 10,000 rows, which silently drops loops
    for stmt in query_text("Q00_schema").split(";"):
        lines = [l for l in stmt.strip().splitlines() if not l.strip().startswith("//")]
        s = "\n".join(lines).strip()
        if s:
            try:
                raw(s)
            except Exception as e:  # index already exists
                if "already" not in str(e).lower():
                    raise


def reset_all() -> None:
    """Delete the current world's demo graphs (never another world's, and never the chat graphs)."""
    for g in graphs():
        if g == config.EXCHANGE or g.startswith("hosp_") or g.startswith("mem_"):
            drop(g)


def drop_world(w: str) -> None:
    """Delete every graph of a private copy."""
    for g in db().list_graphs():
        if w and g.startswith(f"{w}__"):
            db().select_graph(g).delete()


_seq_lock = threading.Lock()
_seq: dict[str, int] = {}  # per world


def event(agent: str, text: str, kind: str = "info") -> None:
    """Append to the agent feed. Events live in the graph so any agent can read them."""
    w = _world.get()
    with _seq_lock:
        if not _seq.get(w):
            rows = raw("MATCH (e:Event) RETURN coalesce(max(e.seq), 0) AS s")
            _seq[w] = rows[0]["s"] if rows else 0
        _seq[w] += 1
        seq = _seq[w]
    raw("CREATE (:Event {seq: $seq, at: timestamp(), agent: $agent, text: $text, kind: $kind})",
        {"seq": seq, "agent": agent, "text": text, "kind": kind})


def reset_seq() -> None:
    _seq.pop(_world.get(), None)

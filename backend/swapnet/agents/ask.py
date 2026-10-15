"""Ask KindRed: a Claude agent that answers coordinator questions by reasoning over the exchange graph.

The model never writes Cypher. It picks from a fixed catalogue of tools, each a human-written, read-only named query
(run through GRAPH.RO_QUERY). Every id it passes is resolved against the graph first, and checked against the
viewer's program and hospital scope. Every tool call is traced (arguments, queries, latency, rows), every answer
carries the graph paths it relied on, and a validator checks that every id in the reply came back from the graph.
If one didn't, the reply is replaced with a plain summary built from the rows. An id the graph doesn't hold gets a
"not in the graph" answer, never a guess.
"""
import json
import os
import re
import time
import uuid

import anthropic
import httpx

from swapnet import organs, programs
from swapnet.access import Viewer
from swapnet.agents import core
from swapnet.graph import db

MODEL = os.getenv("KINDRED_ASK_MODEL", "claude-opus-5-5")
MAX_TURNS = 8
MAX_ROWS = 60
ID = re.compile(r"\b(?:[PSL]-\d{4}(?:-FB)?|[FTD]-[0-9a-f]{6})\b")
LIVE = ["selected", "offered", "testing", "committee", "locked"]

SYSTEM = """You are KindRed's exchange analyst. You answer questions from transplant exchange coordinators about a \
living-donor paired exchange (kidney and liver programs) by reasoning over its FalkorDB graph with the tools provided.

How the graph works:
- A Pair is one family: a patient and their willing donor, registered at a hospital, in exactly one program (kidney or liver).
- CAN_GIVE_TO links a pair's donor to another pair's patient, with a success estimate and the reasons it holds.
- A Loop (S-#### kidney, L-#### liver) is a swap cycle of 2 or 3 pairs; S-####-FB is a loop's stored 2-way fallback.
- FAILED is a link a test ruled out; it is remembered and never proposed again.
- Decisions record who decided what, approved by whom, based on which facts.
- Programs never mix: a kidney pair never links to a liver pair.

Rules:
- Use only facts the tools return. Never invent a pair, loop, hospital, number or reason. Quote ids exactly as returned.
- If a tool says an id is not in the graph, say so plainly. If a search returns nothing, say nothing was found and what \
was searched (for example "no 2-way loop for P-0388 among waiting kidney families"); never describe an empty result as \
good news or "no impact".
- Multi-hop questions (who could replace a family, what breaks if a family withdraws, how two families connect) need \
the traversal tools; prefer them over guessing from one pair's facts.
- When depth matters, say the depth you searched at, and widen it (2-way then 3-way, or 1 hop then 3) when the shallow \
search comes up empty.
- You give decision support. You never approve a transplant, allocate an organ or declare anyone medically suitable; \
a person decides. All data is synthetic.
- Memory: `recall` returns earlier answers about the same families or loops. Check it when a question is about specific ids. If you use a remembered answer, say when it was learned, and re-check with the live tools anything that depends on the current state (statuses, loops, tests), since the graph may have changed since.
- Keep answers short: lead with the answer, then the evidence (ids, routes, numbers) as brief bullets."""


def _tool(name: str, description: str, props: dict, required: list[str]) -> dict:
    return {"name": name, "description": description,
            "input_schema": {"type": "object", "properties": props, "required": required, "additionalProperties": False}}


_PAIR = {"type": "string", "description": "A pair id such as P-0154."}
_LOOP = {"type": "string", "description": "A loop id such as S-0076 or L-0034."}
_ORGAN = {"type": "string", "enum": ["kidney", "liver"], "description": "The program."}

TOOLS = [
    _tool("pool_overview", "Counts for the shared pool: pairs, waiting families, kidney and liver totals, highly "
          "sensitised and urgent patients.", {}, []),
    _tool("family_facts", "The shared (de-identified) facts for up to 10 families: program, hospital, status, blood "
          "groups, cPRA or MELD, test results, approval state, current loop.",
          {"pair_ids": {"type": "array", "items": _PAIR, "maxItems": 10}}, ["pair_ids"]),
    _tool("explain_loop", "A loop link by link: who gives to whom, the success estimate and the recorded reasons for "
          "each link, and any failed link with its test result.", {"loop_id": _LOOP}, ["loop_id"]),
    _tool("decision_trail", "Every decision about a loop: what was decided, by which agent, approved by which person, "
          "based on which facts.", {"loop_id": _LOOP}, ["loop_id"]),
    _tool("committee_readiness", "Each family's committee papers for a loop, what is missing, days left against the "
          "42-day target, and which family is holding the loop up.", {"loop_id": _LOOP}, ["loop_id"]),
    _tool("withdrawal_impact", "What breaks if a family withdraws: the live loops it is in, the other families "
          "affected, and whether each loop's stored fallback survives without it.", {"pair_id": _PAIR}, ["pair_id"]),
    _tool("find_loops_for", "Search the graph for swap loops through one family among waiting families of its program. "
          "max_size 2 finds 2-way swaps only; 3 also finds 3-way swaps (a deeper, 2-hop search). Returns loops with "
          "each link's success estimate, best first.",
          {"pair_id": _PAIR, "max_size": {"type": "integer", "enum": [2, 3]}}, ["pair_id", "max_size"]),
    _tool("reachable_within", "Multi-hop reach: the waiting families of the same program that a family's donor can "
          "reach in at most `hops` donations (1 to 3) over live links, with the shortest route to each.",
          {"pair_id": _PAIR, "hops": {"type": "integer", "minimum": 1, "maximum": 3}}, ["pair_id", "hops"]),
    _tool("connection_path", "The shortest chain of compatibility links from one family's donor to another family's "
          "patient (same program only).", {"from_pair": _PAIR, "to_pair": _PAIR}, ["from_pair", "to_pair"]),
    _tool("exchange_candidates", "Every live link to and from one family inside its program, with the reasons.",
          {"pair_id": _PAIR}, ["pair_id"]),
    _tool("bridge_families", "Waiting families whose withdrawal would break the most possible loops (betweenness "
          "centrality on the compatibility graph), optionally in one program.",
          {"organ": _ORGAN, "limit": {"type": "integer", "minimum": 1, "maximum": 20}}, ["limit"]),
    _tool("recall", "Agent memory: earlier answered questions about any of these families or loops, newest first, "
          "with the date each answer was learned.", {"ids": {"type": "array", "items": {"type": "string"}, "maxItems": 10}},
          ["ids"]),
    _tool("failure_memory", "Links the graph remembers as failed around one family (as donor side or patient side), "
          "with the test that proved each. These links are never proposed again.", {"pair_id": _PAIR}, ["pair_id"]),
]


class NotInGraph(Exception):
    pass


def clean_id(raw) -> str:
    """The id inside whatever a model passed ("Bengaluru's P-0211" -> "P-0211"); otherwise the text as given."""
    text = str(raw).strip().upper()
    m = ID.search(text)
    return m.group(0) if m else text


class ToolBox:
    """Runs the tools for one viewer. Ids are resolved and scope-checked before any traversal."""

    def __init__(self, viewer: Viewer):
        self.v = viewer
        self.paths: list[list[str]] = []

    # ---- guards

    def resolve(self, ids: list[str], want: str) -> dict[str, dict]:
        ids = [clean_id(i) for i in ids]
        rows = {r["id"]: r for r in db.run("Q36_resolve_ids", {"ids": ids})}
        missing = [i for i in ids if not rows.get(i) or rows[i]["kind"] != want]
        if missing:
            raise NotInGraph(f"not in the graph: {', '.join(missing)} (no {want} with that id)")
        hidden = [i for i in ids if not all(self.v.sees(h, rows[i]["organ"]) for h in rows[i]["hospitals"])]
        if hidden:
            raise NotInGraph(f"outside {self.v.name}'s access: {', '.join(hidden)}")
        return rows

    def _organ_ok(self, organ: str | None) -> bool:
        return (organ or organs.DEFAULT) in self.v.programs()

    def sees_scope(self, scope: list[str] | None) -> bool:
        """A memory is visible only if every hospital and program it touches is inside the viewer's scope."""
        return all(self.v.sees(*s.split(":", 1)) for s in (scope or []))

    # ---- tools

    def pool_overview(self) -> dict:
        return db.run("Q20_pool_summary", {"urgent_meld": organs.get("liver").params()["urgent_meld"]})[0]

    def family_facts(self, pair_ids: list[str]) -> list[dict]:
        ids = list(self.resolve(pair_ids, "pair"))
        return programs.pairs(ids=ids)

    def explain_loop(self, loop_id: str) -> list[dict]:
        lid = next(iter(self.resolve([loop_id], "loop")))
        rows = db.run("Q13_explain_loop", {"loop_id": lid})
        if rows:
            self.paths.append([r["from_pair"] for r in rows] + [rows[0]["from_pair"]])
        return rows

    def decision_trail(self, loop_id: str) -> list[dict]:
        lid = next(iter(self.resolve([loop_id], "loop")))
        return db.run("Q14_decision_trail", {"loop_ids": [lid], "failure_ids": [], "pair_ids": []})

    def committee_readiness(self, loop_id: str) -> dict:
        lid = next(iter(self.resolve([loop_id], "loop")))
        r = core.CommitteeClerk().readiness(lid)
        return {"blocking": r["blocking"], "families": [
            {k: x.get(k) for k in ("pair_id", "hospital", "approval_state", "done", "total", "missing", "day", "days_left")}
            for x in r["pairs"]]}

    def withdrawal_impact(self, pair_id: str) -> dict:
        pid = next(iter(self.resolve([pair_id], "pair")))
        rows = db.run("Q32_withdrawal_impact", {"pair_id": pid})
        for r in rows:
            self.paths.append(r["families"] + r["families"][:1])
        return {"pair_id": pid, "live_loops": rows}

    def find_loops_for(self, pair_id: str, max_size: int) -> dict:
        pid = clean_id(pair_id)
        res = self.resolve([pid], "pair")
        organ = res[pid]["organ"]
        if res[pid]["pair_status"] != "waiting":
            return {"pair_id": pid, "organ": organ, "found": 0, "best": [],
                    "note": f"{pid} is {res[pid]['pair_status']}, not waiting: loops are only searched among waiting "
                            f"families. Use withdrawal_impact or family_facts to see the loop it is already in."}
        rows = db.run("Q04_two_way_loops", {"ids": [pid], "organ": organ})
        if int(max_size) >= 3:
            rows += db.run("Q05_three_way_loops", {"ids": [pid], "organ": organ})
        loops = []
        for r in rows:
            p_all = 1.0
            for x in r["probs"]:
                p_all *= x
            # Start each loop at the family asked about, in donation order, so a reply copies the direction right.
            k = r["pairs"].index(pid) if pid in r["pairs"] else 0
            pairs, probs = r["pairs"][k:] + r["pairs"][:k], r["probs"][k:] + r["probs"][:k]
            loops.append({"pairs": pairs, "donations": " -> ".join(pairs + pairs[:1]), "size": len(pairs),
                          "link_success": probs, "p_all": round(p_all, 3)})
        loops.sort(key=lambda x: -x["p_all"])
        for l in loops[:5]:
            self.paths.append(l["pairs"] + l["pairs"][:1])
        return {"pair_id": pid, "organ": organ, "searched": "2-way only" if int(max_size) < 3 else "2-way and 3-way",
                "found": len(loops), "best": loops[:10]}

    def reachable_within(self, pair_id: str, hops: int) -> dict:
        pid = next(iter(self.resolve([pair_id], "pair")))
        hops = max(1, min(3, int(hops)))
        rows = db.run("Q33_reachable_within", {"pair_id": pid, "hops": hops, "limit": 500})
        by_hops: dict[int, int] = {}
        for r in rows:
            by_hops[r["hops"]] = by_hops.get(r["hops"], 0) + 1
        for r in [r for r in rows if r["hops"] == max(by_hops or {0: 0})][:3]:
            self.paths.append(r["route"])
        return {"pair_id": pid, "hops": hops, "reachable": len(rows), "by_hops": by_hops, "routes": rows[:25]}

    def connection_path(self, from_pair: str, to_pair: str) -> dict:
        a, b = clean_id(from_pair), clean_id(to_pair)
        res = self.resolve([a, b], "pair")
        if res[a]["organ"] != res[b]["organ"]:
            return {"route": None, "note": f"{a} is {res[a]['organ']} and {b} is {res[b]['organ']}: programs never link."}
        rows = db.run("Q34_connection_path", {"from_pair": a, "to_pair": b})
        route = rows[0]["route"] if rows and rows[0]["route"] else None
        if route:
            self.paths.append(route)
        return {"route": route, "links": len(route) - 1 if route else None}

    def exchange_candidates(self, pair_id: str) -> dict:
        pid = clean_id(pair_id)
        res = self.resolve([pid], "pair")
        rows = db.run("Q30_exchange_candidates", {"pair_id": pid, "organ": res[pid]["organ"]})
        r = rows[0]
        return {"pair_id": pid, "gives": [g for g in r["gives"] if g], "receives": [x for x in r["receives"] if x]}

    def bridge_families(self, limit: int, organ: str | None = None) -> list[dict]:
        if organ and not self._organ_ok(organ):
            raise NotInGraph(f"outside {self.v.name}'s access: the {organ} program")
        rows = db.run("Q19_bridge_pairs", {"limit": 200})
        facts = {p["pair_id"]: p for p in programs.pairs(ids=[r["pair_id"] for r in rows])}
        out = [{"pair_id": r["pair_id"], "score": round(r["score"], 2), "organ": facts.get(r["pair_id"], {}).get("organ"),
                "city": facts.get(r["pair_id"], {}).get("city")} for r in rows]
        out = [x for x in out if self._organ_ok(x["organ"]) and (not organ or x["organ"] == organ)]
        return out[:max(1, min(20, int(limit)))]

    def failure_memory(self, pair_id: str) -> list[dict]:
        pid = next(iter(self.resolve([pair_id], "pair")))
        rows = db.run("Q35_failure_memory", {"pair_id": pid})
        for r in rows:
            self.paths.append([r["donor_pair"], r["patient_pair"]])
        return rows

    def recall(self, ids: list[str]) -> list[dict]:
        ids = [clean_id(i) for i in ids][:10]
        rows = db.run("Q38_recall", {"ids": ids, "limit": 20})
        return [{k: r[k] for k in ("question_id", "question", "answer", "at", "asked_by")} | {"learned": _date(r["at"])}
                for r in rows if self.sees_scope(r["scope"])][:5]

    def call(self, name: str, args: dict):
        if name not in {t["name"] for t in TOOLS}:
            raise NotInGraph(f"unknown tool {name}")
        return getattr(self, name)(**args)


def _date(ms: int | None) -> str | None:
    return time.strftime("%Y-%m-%d %H:%M UTC", time.gmtime(ms / 1000)) if ms else None


def remember(question: str, answer: str, viewer: Viewer, ids: list[str], tools: list[str]) -> str | None:
    """Store a verified answer as a Question node ABOUT the pairs and loops it verified (agent memory)."""
    ids = [i for i in ids if not i.endswith("-FB") and i[:2] in ("P-", "S-", "L-")]
    if not ids:
        return None
    rows = [r for r in db.run("Q36_resolve_ids", {"ids": ids}) if r["kind"]]
    ids = [r["id"] for r in rows]
    if not ids:          # only ids the graph doesn't hold: nothing worth remembering
        return None
    scope = sorted({f"{h}:{r['organ']}" for r in rows for h in r["hospitals"]})
    qid = f"Q-{uuid.uuid4().hex[:6]}"
    db.run("Q37_remember_answer", {"question_id": qid, "text": question, "answer": answer, "asked_by": viewer.id,
                                   "tools": tools, "scope": scope, "ids": ids})
    return qid


def recent(viewer: Viewer, limit: int = 12) -> list[dict]:
    """Recent answered questions the viewer may see: conversation history that outlives the browser session."""
    box = ToolBox(viewer)
    rows = db.run("Q39_recent_questions", {"limit": 100})
    return [{k: r[k] for k in ("question_id", "question", "answer", "at", "asked_by", "about")}
            for r in rows if box.sees_scope(r["scope"])][:limit]


def _trim(out, max_rows: int = MAX_ROWS) -> tuple[str, int]:
    rows = out if isinstance(out, list) else None
    n = len(rows) if rows is not None else 1
    if rows is not None and len(rows) > max_rows:
        out = {"rows": rows[:max_rows], "truncated": f"{len(rows) - max_rows} more rows not shown"}
    return json.dumps(out, default=str, ensure_ascii=False, separators=(",", ":")), n


def _fallback_text(trace: list[dict]) -> str:
    lines = ["I couldn't verify every id in my draft answer against the graph, so here is only what the queries returned:"]
    for t in trace:
        args = ", ".join(f"{k}={v}" for k, v in t["input"].items())
        lines.append(f"- {t['tool']}({args}): " + (t["error"] if t.get("error") else f"{t['rows']} row(s); ids {', '.join(t['ids'][:12]) or 'none'}"))
    return "\n".join(lines)


# ---------------------------------------------------------------- model providers
# The tool loop, id checks, trace and memory are the same for every model. A provider only translates messages:
# Claude through the Anthropic API, or a local model through Ollama (free, no key, runs on the laptop).

class Turn:
    def __init__(self, text: str, calls: list[tuple[str, str, dict]], stop: str, model: str, usage: dict, raw):
        self.text, self.calls, self.stop, self.model, self.usage, self.raw = text, calls, stop, model, usage, raw


class ClaudeLLM:
    name = "anthropic"
    max_rows = MAX_ROWS

    def __init__(self, client: anthropic.Anthropic | None = None):
        self.client = client or anthropic.Anthropic()
        self.model = MODEL

    def start(self, history: list[dict], question: str) -> list:
        return [*history, {"role": "user", "content": question}]

    def turn(self, messages: list) -> Turn:
        r = self.client.beta.messages.create(
            model=self.model, max_tokens=16000, system=SYSTEM, tools=TOOLS, messages=messages,
            output_config={"effort": "medium"}, cache_control={"type": "ephemeral"},
            betas=["server-side-fallback-2026-07-01"], fallbacks="default")
        usage = {k: getattr(r.usage, k, 0) or 0 for k in ("input_tokens", "output_tokens", "cache_read_input_tokens")}
        calls = [(b.id, b.name, dict(b.input)) for b in r.content if b.type == "tool_use"]
        text = "".join(b.text for b in r.content if b.type == "text").strip()
        return Turn(text, calls, r.stop_reason, getattr(r, "model", self.model), usage, r)

    def add_turn(self, messages: list, turn: Turn) -> None:
        messages.append({"role": "assistant", "content": turn.raw.content})

    def add_results(self, messages: list, results: list[dict]) -> None:
        messages.append({"role": "user", "content": [
            {"type": "tool_result", "tool_use_id": r["id"], "content": r["text"], "is_error": r["is_error"]} for r in results]})


OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434").rstrip("/")
OLLAMA_MODEL = os.getenv("KINDRED_OLLAMA_MODEL", "llama3.1:8b")
OLLAMA_CTX = int(os.getenv("KINDRED_OLLAMA_CTX", "16384"))


_BLOB = re.compile(r"\{[^{}]*\"name\"\s*:\s*\"(?P<name>[\w.]+)\"[^{}]*?\"(?:parameters|arguments)\"\s*:\s*(?P<args>\{[^{}]*\})[^{}]*\}")
_ANNOUNCE = re.compile(r"(?i)\b(let me|i'll|i will|i can try|trying to)\b")


def text_calls(text: str) -> tuple[str, list[tuple[str, str, dict]]]:
    """Small local models sometimes write a tool call as JSON in their reply instead of calling the tool. A call to
    a real tool is run like any other; a call to a tool that doesn't exist is removed, with the sentence announcing
    it, so the reply never shows an action that didn't happen."""
    names = {t["name"] for t in TOOLS}
    calls, out = [], text
    for i, m in enumerate(_BLOB.finditer(text)):
        out = out.replace(m.group(0), "")
        if m.group("name") in names:
            try:
                calls.append((f"text_{i}", m.group("name"), json.loads(m.group("args"))))
            except json.JSONDecodeError:
                pass
    if out != text:
        paras = [x.strip() for x in re.split(r"\n\s*\n", out) if x.strip()]
        while paras and _ANNOUNCE.search(paras[-1]):
            paras.pop()
        out = "\n\n".join(paras)
    return out, calls


class OllamaLLM:
    """A local model served by Ollama (native /api/chat with tools). Small local models are less careful than Claude,
    which is why ids are pulled out of their arguments, results are trimmed harder, and the id validator stays on."""
    name = "ollama"
    max_rows = 20

    def __init__(self, base: str | None = None, model: str | None = None, http=None):
        self.base, self.model = base or OLLAMA_URL, model or OLLAMA_MODEL
        self.http = http or httpx.Client(timeout=600)
        self.tools = [{"type": "function", "function": {"name": t["name"], "description": t["description"],
                                                        "parameters": t["input_schema"]}} for t in TOOLS]

    def start(self, history: list[dict], question: str) -> list:
        return [{"role": "system", "content": SYSTEM + "\n- Pass ids exactly as written, e.g. P-0211, not a name."},
                *history, {"role": "user", "content": question}]

    def turn(self, messages: list) -> Turn:
        r = self.http.post(f"{self.base}/api/chat", json={
            "model": self.model, "messages": messages, "tools": self.tools, "stream": False, "keep_alive": "30m",
            "options": {"num_ctx": OLLAMA_CTX, "temperature": 0}})
        r.raise_for_status()
        body = r.json()
        msg = body.get("message") or {}
        calls = []
        for i, tc in enumerate(msg.get("tool_calls") or []):
            fn = tc.get("function") or {}
            args = fn.get("arguments") or {}
            if isinstance(args, str):
                try:
                    args = json.loads(args)
                except json.JSONDecodeError:
                    args = {}
            calls.append((tc.get("id") or f"call_{i}", fn.get("name", ""), args if isinstance(args, dict) else {}))
        text = (msg.get("content") or "").strip()
        if not calls:
            text, calls = text_calls(text)
            if calls:   # replay them as real tool calls, so the conversation stays well formed
                msg = {**msg, "content": text, "tool_calls": [{"function": {"name": n, "arguments": a}} for _, n, a in calls]}
        stop = "tool_use" if calls else ("max_tokens" if body.get("done_reason") == "length" else "end_turn")
        usage = {"input_tokens": body.get("prompt_eval_count", 0), "output_tokens": body.get("eval_count", 0),
                 "cache_read_input_tokens": 0}
        return Turn(text, calls, stop, f"ollama/{self.model}", usage, msg)

    def add_turn(self, messages: list, turn: Turn) -> None:
        messages.append({"role": "assistant", "content": turn.raw.get("content") or "",
                         "tool_calls": turn.raw.get("tool_calls") or []})

    def add_results(self, messages: list, results: list[dict]) -> None:
        for r in results:
            messages.append({"role": "tool", "tool_name": r["name"], "content": r["text"]})

    def ready(self) -> bool:
        try:
            names = [m["name"] for m in self.http.get(f"{self.base}/api/tags", timeout=3).json().get("models", [])]
        except (httpx.HTTPError, ValueError):
            return False
        return self.model in names or f"{self.model}:latest" in names


def provider() -> str:
    """KINDRED_ASK_PROVIDER picks the model; without it, Claude when a key is set, otherwise local Ollama."""
    p = os.getenv("KINDRED_ASK_PROVIDER", "").strip().lower()
    if p in ("anthropic", "ollama"):
        return p
    return "anthropic" if (os.getenv("ANTHROPIC_API_KEY") or os.getenv("ANTHROPIC_AUTH_TOKEN")) else "ollama"


def default_llm():
    return ClaudeLLM() if provider() == "anthropic" else OllamaLLM()


def status() -> dict:
    p = provider()
    if p == "anthropic":
        return {"enabled": bool(os.getenv("ANTHROPIC_API_KEY") or os.getenv("ANTHROPIC_AUTH_TOKEN")),
                "provider": p, "model": MODEL, "how": "set ANTHROPIC_API_KEY in .env"}
    llm = OllamaLLM()
    return {"enabled": llm.ready(), "provider": p, "model": f"ollama/{llm.model}",
            "how": f"start Ollama and run: ollama pull {llm.model} (the API looks for it at {llm.base})"}


def ask(question: str, viewer: Viewer, history: list[dict] | None = None, client: anthropic.Anthropic | None = None,
        llm=None) -> dict:
    """Answer one coordinator question. `history` is earlier turns as [{"role", "content"}] plain text."""
    llm = llm or (ClaudeLLM(client) if client else default_llm())
    box = ToolBox(viewer)
    past = [{"role": m["role"], "content": str(m["content"])} for m in (history or [])[-6:]
            if m.get("role") in ("user", "assistant") and m.get("content")]
    while past and past[0]["role"] != "user":
        past.pop(0)
    messages = llm.start(past, question)
    trace: list[dict] = []
    seen: set[str] = set(ID.findall(question.upper()))
    usage = {"input_tokens": 0, "output_tokens": 0, "cache_read_input_tokens": 0}
    t_start = time.perf_counter()
    turn = None
    for _ in range(MAX_TURNS):
        turn = llm.turn(messages)
        for k in usage:
            usage[k] += turn.usage.get(k, 0) or 0
        if turn.stop != "tool_use":
            break
        llm.add_turn(messages, turn)
        results = []
        for call_id, name, args in turn.calls:
            entry = {"tool": name, "input": dict(args)}
            t0 = time.perf_counter()
            with db.track() as tr:
                try:
                    out = box.call(name, dict(args))
                    text, n = _trim(out, llm.max_rows)
                    entry.update(rows=n)
                    is_error = False
                except NotInGraph as e:
                    text, is_error = json.dumps({"error": str(e)}), True
                    entry.update(rows=0, error=str(e))
                except (TypeError, ValueError, KeyError) as e:
                    text, is_error = json.dumps({"error": f"bad arguments: {e}"}), True
                    entry.update(rows=0, error=f"bad arguments: {e}")
            entry.update(ms=round((time.perf_counter() - t0) * 1000), queries=tr.ran, ids=sorted(set(ID.findall(text))))
            seen.update(entry["ids"])
            trace.append(entry)
            results.append({"id": call_id, "name": name, "text": text, "is_error": is_error})
        llm.add_results(messages, results)

    stop = turn.stop if turn else None
    draft = turn.text if turn else ""
    if stop == "refusal":
        draft = "I can't help with that request."
    elif stop == "tool_use":
        draft = draft or "I ran out of steps before finishing. Try a narrower question."
    elif stop == "max_tokens":
        draft = (draft + "\n\n(The answer was cut off.)").strip()
    used = sorted(set(ID.findall(draft)))
    unverified = [i for i in used if i not in seen]
    answer = draft if not unverified else _fallback_text(trace)
    remembered = None
    if not unverified and stop == "end_turn" and trace:
        with db.track() as mem:
            remembered = remember(question, answer, viewer, [i for i in used if i in seen], [t["tool"] for t in trace])
        if remembered:
            trace.append({"tool": "(memory) remember_answer", "input": {"question_id": remembered}, "rows": 1,
                          "ms": round(sum(q["ms"] for q in mem.ran)), "queries": mem.ran, "ids": []})

    path_ids = sorted({p for path in box.paths for p in path})
    nodes = {p["pair_id"]: {"city": p["city"], "organ": p["organ"], "status": p["status"]}
             for p in (programs.pairs(ids=path_ids) if path_ids else [])}
    uniq_paths, keyset = [], set()
    for p in box.paths:
        if tuple(p) not in keyset:
            keyset.add(tuple(p))
            uniq_paths.append(p)
    return {"answer": answer, "draft_replaced": bool(unverified), "unverified_ids": unverified,
            "verified_ids": [i for i in used if i in seen], "trace": trace, "paths": uniq_paths[:12], "nodes": nodes,
            "remembered_as": remembered, "provider": llm.name, "model": turn.model if turn else getattr(llm, "model", ""),
            "stop_reason": stop, "usage": usage, "ms": round((time.perf_counter() - t_start) * 1000)}

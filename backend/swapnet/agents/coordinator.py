"""The coordinator agent: a language model that runs one demo patient's case (docs/personas.md).

Each simulated week it gets the patient's state, read from the graph (stage and trend, the swap and its tests, missing
committee papers, how the pool changed, and the last things the agents remembered), and chooses what to do from a fixed
catalogue of tools. It never writes Cypher and never invents an id: every tool is human-written, checks its own
preconditions against the graph, and refuses with a reason the model can read. At most one action per week (a real
week has one step of this kind); searches are free. Searches are tried shallow first (2-way), then deep (3-way), and
every search is stored, so the page can show what a shallow search missed.

The rules are the safety net. If no model is configured or it fails, the same tools run in the order the rules give.
If the model waits while the rules say a step is due, the rules run it and the trace says so. Every week's choice is a
Decision in the exchange graph and a Finding (with the model's reason and the full tool trace) in the patient's memory.
"""
import json
import time

from swapnet import personas
from swapnet.agents import ask, core, recall
from swapnet.graph import db, publish

NAME = "Coordinator agent"
DAY_MS = personas.DAY_MS
MAX_TURNS = 6
WRITES = ("form_swap", "run_tests", "request_papers", "book_surgery")

SYSTEM = """You are KindRed's coordinator agent for one patient in a living-donor paired exchange (synthetic data).
Each week you get the patient's state from the graph and take this week's step with the tools.
- One action per week: form_swap, run_tests, request_papers, book_surgery, or wait. find_swaps is free.
- To find a swap: find_swaps max_size 2 first; only if it finds nothing, max_size 3; then form_swap if anything was found.
- `due` is what the rules expect this week; follow it unless a tool says otherwise. Use only ids from the state or tools.
- Every action takes `reason`: one or two plain sentences for the care team on what you did and why.
- You support people; you never declare anyone medically suitable."""

_REASON = {"type": "string", "description": "One or two plain sentences for the care team: what and why."}
TOOLS = [
    ask._tool("find_swaps", "Search the graph for swap loops through this patient among waiting families of their program. "
              "max_size 2 = 2-way swaps only (shallow); 3 = also 3-way swaps (deeper). Returns how many were found and the "
              "best ones with each link's chance.", {"max_size": {"type": "integer", "enum": [2, 3]}}, ["max_size"]),
    ask._tool("form_swap", "Form the best swap through this patient and send offers. Only after a search this week found one.",
              {"reason": _REASON}, ["reason"]),
    ask._tool("run_tests", "Run the swap's pre-surgery tests (kidney: lab crossmatch; liver: donor work-up) and act on them.",
              {"loop_id": ask._LOOP, "reason": _REASON}, ["loop_id", "reason"]),
    ask._tool("request_papers", "Ask the hospitals for the committee papers still missing for the swap's families.",
              {"loop_id": ask._LOOP, "reason": _REASON}, ["loop_id", "reason"]),
    ask._tool("book_surgery", "File the complete committee case and book surgery, same day for every family. Only when the "
              "tests passed and no paper is missing.", {"loop_id": ask._LOOP, "reason": _REASON}, ["loop_id", "reason"]),
    ask._tool("wait", "Do nothing this week.", {"reason": _REASON}, ["reason"]),
]


def _date(ms: int) -> str:
    return time.strftime("%d %b", time.localtime(ms / 1000))


def _missing(c: dict) -> list[dict]:
    out = []
    asked = {r["q"]: r["at"] for r in db.raw("MATCH (q:Pair) WHERE q.pair_id IN $ids AND q.docs_requested_at IS NOT NULL "
                                             "RETURN q.pair_id AS q, q.docs_requested_at AS at", {"ids": c["pairs"]})}
    for pid, code in zip(c["pairs"], c["codes"]):
        for d in publish.documents(pid, code):
            if d["status"] != "verified":
                out.append({"pair_id": pid, "hospital": code, "paper": d["type"], "requested_at": asked.get(pid)})
    return out


def _waiting(organ: str) -> int:
    return db.raw("MATCH (q:Pair {organ: $o, status: 'waiting'}) RETURN count(q) AS n", {"o": organ})[0]["n"]


# ---------------------------------------------------------------- what the agent sees

def state(p: dict, now: int, read: list[dict] | None = None) -> dict:
    """The patient's situation, read from the three graphs, plus what the rules expect this week (`due`). Each memory
    it reads is listed in `read` (who wrote it and what it is used for), so the page can show the agents coordinating."""
    from swapnet.agents import health
    read = [] if read is None else read
    pid, mg = p["id"], personas.memory_graph(p["id"])
    facts = {f["key"]: f for f in db.run("Q42_current_facts", {"persona_id": pid}, graph=mg)}
    recent = db.run("Q43_findings", {"persona_id": pid, "limit": 4}, graph=mg)
    failed = db.run("Q35_failure_memory", {"pair_id": p["pair_id"]})
    pair = db.raw("MATCH (pp:Pair {pair_id: $id}) RETURN pp.status AS s, coalesce(pp.urgent, false) AS u, pp.searched_pool AS n",
                  {"id": p["pair_id"]})[0]
    c = health.case(p["pair_id"])
    stage = facts.get("stage", {}).get("value")
    waiting = _waiting(p["organ"])
    st = {"patient": {"pair_id": p["pair_id"], "name": p["name"], "program": p["organ"], "hospital": p["hospital"]},
          "today": _date(now), "stage": personas.stage_label(p["organ"], stage),
          "trend": facts.get("trend", {}).get("text"), "projection": facts.get("projection", {}).get("text"),
          "pair_status": pair["s"], "urgent": stage in ("prepare", "act"),
          "pool": {"waiting_families": waiting, "changed_since_last_search": pair["n"] is not None and pair["n"] != waiting,
                   "searched_before": pair["n"] is not None},
          # Memory: the last things the agents noticed or did, so this week's choice builds on them.
          "remembered": [f"{_date(f['at'])}: {f['text'][:160]}" for f in recent[:3]]}
    if failed:  # links a lab test ruled out; searches never propose them again
        st["failed_links"] = [f"{f['donor_pair']} → {f['patient_pair']}: {f['detail'] or f['cause']}" for f in failed[:4]]
    if facts:
        writers = recall.who("Coordinator agent" if k == "swap" else "Health watch" for k in facts)
        read.append(recall.item("beliefs", "semantic", writers, len(facts), "the stage and trend decide whether a swap is urgent",
                                [f["text"] for k, f in sorted(facts.items()) if k in ("stage", "trend", "swap")]))
    if recent[:3]:
        writers = recall.who(recall.FINDING_WRITER.get(f["kind"], "an agent") for f in recent[:3])
        read.append(recall.item("recent findings", "episodic", writers, len(recent[:3]), "this week's step builds on them",
                                [f"{_date(f['at'])}: {f['text'][:90]}" for f in recent[:3]]))
    if pair["n"] is not None and not c:  # only matters while the patient still needs a swap
        read.append(recall.item("pool size from the last search", "episodic", "Coordinator agent", 1,
                                "no repeat search while the pool is unchanged" if pair["n"] == waiting else
                                f"the pool changed ({pair['n']} → {waiting} waiting families), so search again",
                                [f"{pair['n']} waiting families then, {waiting} now"]))
    read.append(recall.item(f"failed-link memor{'y' if len(failed) == 1 else 'ies'} for this patient", "episodic",
                            "Crossmatch coordinator", len(failed),
                            "never proposed again: searches only walk live links" if failed else "nothing to skip",
                            st.get("failed_links")))
    if c:
        missing = _missing(c) if c["status"] == "committee" else []
        asked = [m for m in missing if m["requested_at"]]
        if missing:
            read.append(recall.item("paper requests", "shared", "Committee clerk", len(asked),
                                    "already requested, so not asked twice" if asked else "none yet: these papers can be requested",
                                    [f"{m['pair_id']}: {m['paper'].replace('_', ' ')}" for m in (asked or missing)]))
        st["swap"] = {"loop_id": c["loop_id"], "status": c["status"], "route": c["route"], "families": c["pairs"],
                      "surgery_on": _date(c["surgery_at"]) if c["surgery_at"] else None,
                      "missing_papers": [{"family": m["pair_id"], "paper": m["paper"].replace("_", " "),
                                          "requested": bool(m["requested_at"])} for m in missing]}
    st["due"] = due(st)
    return st


def due(st: dict) -> str:
    """What the rules expect this week; the model reads it, and the safety net runs it if the model fails."""
    s = st.get("swap")
    if not s:
        if st["pair_status"] != "waiting" or not st["urgent"]:
            return "wait: no swap needed yet; the weekly match includes this patient"
        if st["pool"]["searched_before"] and not st["pool"]["changed_since_last_search"]:
            return "wait: the pool hasn't changed since the last search"
        return "find_swaps, then form_swap if one is found"
    if s["status"] in core.TESTABLE:
        return f"run_tests {s['loop_id']}"
    if s["status"] == "committee":
        if any(not m["requested"] for m in s["missing_papers"]):
            return f"request_papers {s['loop_id']}"
        if s["missing_papers"]:
            return "wait: the hospitals are sending the requested papers"
        return f"book_surgery {s['loop_id']}"
    return f"wait: surgery booked for {s['surgery_on']}" if s.get("surgery_on") else "wait"


# ---------------------------------------------------------------- the tools

class CaseTools:
    """The coordinator's catalogue for one patient and one week. Each tool checks the graph before it acts."""

    def __init__(self, p: dict, now: int, week: int, by: str):
        self.p, self.now, self.week, self.by = p, now, week, by
        self.acted: str | None = None
        self.found = 0
        self.trace: list[dict] = []

    def call(self, name: str, args: dict, by: str | None = None) -> dict:
        t0 = time.perf_counter()
        try:
            if name not in {t["name"] for t in TOOLS}:
                raise ValueError(f"unknown tool {name}")
            if name in WRITES and self.acted:
                raise ValueError(f"already acted this week ({self.acted}); one action per week")
            out = getattr(self, name)(**args)
            err = None
        except (ValueError, TypeError) as e:
            out, err = {"error": str(e)}, str(e)
        self.trace.append({"tool": name, "input": args, "result": out, "error": err, "by": by or self.by,
                           "ms": round((time.perf_counter() - t0) * 1000)})
        return out

    def _case(self, loop_id: str | None = None) -> dict:
        from swapnet.agents import health
        c = health.case(self.p["pair_id"])
        if not c:
            raise ValueError(f"{self.p['pair_id']} is not in a swap")
        if loop_id and ask.clean_id(loop_id) != c["loop_id"]:
            raise ValueError(f"{loop_id} is not this patient's swap; the patient's swap is {c['loop_id']}")
        return c

    def find_swaps(self, max_size: int) -> dict:
        pid, organ = self.p["pair_id"], self.p["organ"]
        st = db.raw("MATCH (pp:Pair {pair_id: $id}) RETURN pp.status AS s", {"id": pid})[0]["s"]
        if st != "waiting":
            raise ValueError(f"{pid} is {st}, not waiting: swaps are only searched among waiting families")
        size = 3 if int(max_size) >= 3 else 2
        rows = db.run("Q04_two_way_loops", {"ids": [pid], "organ": organ})
        deep = db.run("Q05_three_way_loops", {"ids": [pid], "organ": organ}) if size == 3 else []
        loops = []
        for r in rows + deep:
            pall = 1.0
            for x in r["probs"]:
                pall *= x or 0
            k = r["pairs"].index(pid) if pid in r["pairs"] else 0
            pairs = r["pairs"][k:] + r["pairs"][:k]
            loops.append({"families": pairs, "size": len(pairs), "route": core._route(pairs), "p_all": round(pall, 3)})
        loops.sort(key=lambda x: -x["p_all"])
        found_here = len(deep) if size == 3 else len(rows)
        self.found += len(loops)
        personas.record_search(self.p["id"], at=self.now, week=self.week, depth=size, found=found_here,
                               total=len(loops), loops=loops[:5], by=self.by)
        db.raw("MATCH (pp:Pair {pair_id: $id}) SET pp.searched_pool = $n", {"id": pid, "n": _waiting(organ)})
        return {"searched": "2-way only" if size == 2 else "2-way and 3-way", "found": len(loops),
                "two_way": len(rows), "three_way": len(deep) if size == 3 else None, "best": loops[:5]}

    def form_swap(self, reason: str = "") -> dict:
        pid = self.p["pair_id"]
        if not self.found:
            raise ValueError("no search this week found a swap; call find_swaps first")
        loops = core.MatchingAgent().rematch([pid])
        mine = next((l for l in loops if pid in l["pairs"]), None)
        if not mine:
            raise ValueError("the optimiser found no swap through this patient worth offering")
        self.acted = "form_swap"
        db.raw("MATCH (pp:Pair {pair_id: $id}) SET pp.urgent = true", {"id": pid})
        route = core._route(mine["pairs"])
        personas.update_fact(self.p["id"], "swap", mine["loop_id"], f"In swap {mine['loop_id']} ({route})", self.now)
        return {"formed": mine["loop_id"], "route": route, "families": mine["pairs"],
                "expected_transplants": f"{mine['expected_tx']} of {len(mine['pairs'])}", "offers": "sent"}

    def run_tests(self, loop_id: str, reason: str = "") -> dict:
        c = self._case(loop_id)
        if c["status"] not in core.TESTABLE:
            raise ValueError(f"{c['loop_id']} is {c['status']}: its tests are already done")
        res = core.CrossmatchCoordinator().run_lab(c["loop_id"])
        self.acted = "run_tests"
        test = core._loop_organ(c["loop_id"]).test_name
        failed = [x for x in res if x["result"] == "positive"]
        return {"loop_id": c["loop_id"], "test": test, "results": [{"link": f"{x['a']} → {x['b']}", "result": x["result"]} for x in res],
                "outcome": f"a {test} failed: {failed[0].get('detail')}" if failed else f"every {test} passed"}

    def request_papers(self, loop_id: str, reason: str = "") -> dict:
        c = self._case(loop_id)
        if c["status"] != "committee":
            raise ValueError(f"{c['loop_id']} is {c['status']}: papers are collected once the tests have passed")
        ask_for = [m for m in _missing(c) if not m["requested_at"]]
        if not ask_for:
            raise ValueError("every missing paper has already been requested")
        db.raw("MATCH (q:Pair) WHERE q.pair_id IN $ids SET q.docs_requested_at = $now",
               {"ids": list({m["pair_id"] for m in ask_for}), "now": self.now})
        self.acted = "request_papers"
        what = [f"{m['pair_id']}: {m['paper'].replace('_', ' ')}" for m in ask_for]
        core.decide("Committee clerk", "chase", f"Requested {', '.join(what)} for {c['loop_id']}", [("Loop", "loop_id", c["loop_id"])],
                    pair_id=self.p["pair_id"])
        return {"requested": what, "note": "hospitals usually answer within a week"}

    def book_surgery(self, loop_id: str, reason: str = "") -> dict:
        c = self._case(loop_id)
        if c["status"] != "committee":
            raise ValueError(f"{c['loop_id']} is {c['status']}: surgery is booked once the tests have passed")
        missing = _missing(c)
        if missing:
            raise ValueError(f"papers still missing: {', '.join(m['pair_id'] + ' ' + m['paper'] for m in missing)}")
        surgery = self.now + 7 * DAY_MS
        db.raw("""MATCH (l:Loop {loop_id: $l}) SET l.status = 'locked', l.surgery_at = $at
                  WITH l MATCH (q:Pair)-[:IN_LOOP]->(l) SET q.status = 'locked', q.approval_state = 'approved'""",
               {"l": c["loop_id"], "at": surgery})
        db.raw("""MATCH (pp:Pair {pair_id: $id})
                  CREATE (pp)-[:HAS_APPOINTMENT]->(:Appointment {appointment_id: $a, kind: 'Transplant surgery', status: 'booked',
                                                                 at: $at, note: $n, booked_by: 'Scheduler'})""",
               {"id": self.p["pair_id"], "a": core._id("A"), "at": surgery, "n": f"{c['loop_id']}: every family on the same day"},
               graph=personas.hospital_graph(self.p))
        self.acted = "book_surgery"
        personas.update_fact(self.p["id"], "swap", f"{c['loop_id']}:booked",
                             f"In swap {c['loop_id']} ({c['route']}); transplant booked for {_date(surgery)}", self.now)
        db.event("Scheduler", f"{c['loop_id']} ({c['route']}): committee file complete; surgery booked for {_date(surgery)}, "
                              "same day for every family. Synthetic.", "ok")
        return {"loop_id": c["loop_id"], "surgery_on": _date(surgery), "committee": "file complete (synthetic approval)"}

    def wait(self, reason: str) -> dict:
        return {"waiting": True, "reason": reason}


class McpCaseTools:
    """The same catalogue, called over MCP on KindRed's own MCP server (agents/mcp_client.py). The server keeps the
    week's session, so it enforces one action per week whichever client calls; this side keeps the trace."""

    def __init__(self, p: dict, now: int, week: int, by: str):
        self.p, self.now, self.week, self.by = p, now, week, by
        self.acted: str | None = None
        self.found = 0
        self.trace: list[dict] = []

    def call(self, name: str, args: dict, by: str | None = None) -> dict:
        from swapnet.agents import mcp_client
        t0 = time.perf_counter()
        try:
            out = mcp_client.client.call(f"patient_{name}", {**args, "persona": self.p["id"], "world": db.world()})
        except mcp_client.McpError as e:
            out = {"error": str(e)}
        week = out.pop("_week", None)
        if week:
            self.acted, self.found = week.get("acted"), week.get("found") or 0
        self.trace.append({"tool": name, "input": args, "result": out, "error": out.get("error"), "by": by or self.by,
                           "ms": round((time.perf_counter() - t0) * 1000), "via": "mcp"})
        return out


def _tools_over_mcp(p: dict, now: int, week: int):
    """The model's catalogue as the MCP server lists it, and tools that call it. In-process if MCP isn't reachable."""
    from swapnet.agents import mcp_client
    try:
        catalogue = [t for t in mcp_client.client.catalogue("patient_", hidden=("persona", "world")) if t["name"] != "case_state"]
        if catalogue:
            return catalogue, McpCaseTools(p, now, week, by="model"), None
    except mcp_client.McpError as e:
        return TOOLS, CaseTools(p, now, week, by="model"), f"The MCP server wasn't reachable ({e}); the same tools ran in-process."
    return TOOLS, CaseTools(p, now, week, by="model"), "The MCP server listed no patient tools; the same tools ran in-process."


# ---------------------------------------------------------------- one week

def _rules(tools: CaseTools, st: dict) -> None:
    """The safety net: the step the rules expect, through the same tools."""
    d, s = _due_tool(st), st.get("swap")
    if d == "find_swaps":
        if not any(t["tool"] == "find_swaps" and not t["error"] for t in tools.trace):
            if not tools.call("find_swaps", {"max_size": 2}, by="rules").get("found"):
                tools.call("find_swaps", {"max_size": 3}, by="rules")
        if tools.found:
            tools.call("form_swap", {"reason": "The rules' step for this week: a search found a swap."}, by="rules")
    elif s and d in WRITES:
        tools.call(d, {"loop_id": s["loop_id"], "reason": f"The rules' step for this week: {st['due']}."}, by="rules")


def _due_tool(st: dict) -> str:
    return st["due"].split(" ")[0].rstrip(",:")


def run_week(p: dict, now: int, week: int, trigger: str = "weekly review") -> dict:
    """Let the model choose this week's step for the patient; fall back to the rules when it can't."""
    read: list[dict] = []
    st = state(p, now, read)
    catalogue, tools, mcp_note = _tools_over_mcp(p, now, week)
    reason, model, note = "", None, None
    status = ask.status()
    if status["enabled"]:
        try:
            llm = ask.default_llm(SYSTEM, catalogue)
            messages = llm.start([], f"Trigger: {trigger}. State from the graph: {json.dumps(st, separators=(',', ':'))}")
            for _ in range(MAX_TURNS):
                turn = llm.turn(messages)
                model = turn.model
                if turn.stop != "tool_use":
                    reason = turn.text.strip()
                    break
                llm.add_turn(messages, turn)
                results = []
                for cid, name, args in turn.calls:
                    out = tools.call(name, dict(args or {}))
                    if name != "find_swaps" and "error" not in out:
                        reason = str((args or {}).get("reason") or reason)
                    results.append({"id": cid, "name": name, "text": json.dumps(out, default=str), "is_error": "error" in out})
                if tools.acted or any(t["tool"] == "wait" and not t["error"] for t in tools.trace):
                    break  # this week's step is taken; no need for another model turn
                llm.add_results(messages, results)
        except Exception as e:  # the model or its provider failed: the rules take over, unless it already acted
            if not tools.acted:
                note = f"The model ({status['model']}) failed ({type(e).__name__}); the rules ran this week's step."
            model = model or status["model"]
    else:
        note = f"No model configured ({status.get('how', '')}); the rules ran this week's step."
    d = _due_tool(st)
    searched = any(t["tool"] == "find_swaps" and not t["error"] for t in tools.trace)
    # The model may search and find nothing (that's a real answer); it may not skip a step that is due.
    if note is None and not tools.acted and (d in WRITES or (d == "find_swaps" and (not searched or tools.found))):
        note = f"Safety net: the model didn't act while the rules expected \"{st['due']}\", so the rules ran it."
    if note:
        _rules(tools, st)
    did = next((t for t in reversed(tools.trace) if t["tool"] in WRITES and not t["error"]), None)
    summary = _summary(tools, did)
    # The model's reason may only name ids that this week's action actually returned (or the patient's own).
    allowed = set(ask.ID.findall(json.dumps(did["result"] if did else {}, default=str))) | {p["pair_id"]}
    if did is None:
        allowed |= set(ask.ID.findall(json.dumps(tools.trace, default=str)))
    stray = sorted(set(ask.ID.findall(reason.upper().replace("‑", "-"))) - allowed) if reason else []
    if stray:
        note = (note + " " if note else "") + f"The model's reason named {', '.join(stray)}, which this week's result doesn't show, so it was replaced by the result."
        reason = ""
    if mcp_note:
        note = f"{note} {mcp_note}" if note else mcp_note
    text = (reason or summary) if not note else f"{summary} {note}"
    personas.remember_decision(p["id"], at=now, week=week, text=f"{NAME}: {text}", trace=tools.trace, model=model,
                               reason=reason, safety_net=note, due=st["due"], action=did["tool"] if did else "wait", read=read)
    core.decide(NAME, did["tool"] if did else "wait", (reason or summary)[:500], [("Pair", "pair_id", p["pair_id"])],
                pair_id=p["pair_id"], read=read)
    db.event(NAME, f"{p['pair_id']} ({p['name']}): {summary}", "plan" if did else "info")
    return {"action": did["tool"] if did else "wait", "summary": summary, "reason": reason, "model": model,
            "safety_net": note, "trace": tools.trace, "read": read, "via": "mcp" if isinstance(tools, McpCaseTools) else "in-process"}


def _summary(tools: CaseTools, did: dict | None) -> str:
    searches = [t for t in tools.trace if t["tool"] == "find_swaps" and not t["error"]]
    # Label each search by what the tool ran, not by the model's input (it may send max_size as "2").
    parts = [f"2-way search found {t['result'].get('two_way')}" if t["result"].get("three_way") is None
             else f"3-way search found {t['result'].get('three_way')}" for t in searches]
    if did:
        r = did["result"]
        parts.append({"form_swap": f"formed swap {r.get('formed')} ({r.get('route')}) and sent offers",
                      "run_tests": f"ran the tests on {r.get('loop_id')}: {r.get('outcome')}",
                      "request_papers": f"asked the hospitals for {', '.join(r.get('requested', []))}",
                      "book_surgery": f"filed the committee case and booked surgery for {r.get('surgery_on')}"}[did["tool"]])
    else:
        w = next((t for t in tools.trace if t["tool"] == "wait"), None)
        parts.append(f"waited: {w['input'].get('reason')}" if w else "nothing to do this week")
    s = "; ".join(parts)
    return s[0].upper() + s[1:] + "."

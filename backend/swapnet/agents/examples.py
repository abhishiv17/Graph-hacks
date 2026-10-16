"""Ask KindRed's example conversations: a few questions answered the moment the page opens, so a visitor sees what the
agent does before typing anything.

They run the same tools a model would pick (ToolBox), live against the graph, so the trace, the queries, the paths and
the ids are real and change with the pool. Only the sentence is written by code instead of a model, and each answer
says so ("graph (example answer, no model)"). Each one shows something the blog asks for: the same question at a
shallow and a deep depth, a FalkorDB algorithm as a tool, what breaks if a family leaves, an answer from memory with
the date it was learned, and an id that isn't in the graph."""
import json
import time

from swapnet import personas, programs
from swapnet.access import Viewer
from swapnet.agents import ask
from swapnet.graph import db

MODEL = "graph (example answer, no model)"


class _Run:
    """One example: tool calls traced exactly like ask.ask() traces a model's calls."""

    def __init__(self, viewer: Viewer):
        self.box = ask.ToolBox(viewer)
        self.trace: list[dict] = []
        self.seen: set[str] = set()
        self.t0 = time.perf_counter()

    def call(self, name: str, args: dict):
        entry = {"tool": name, "input": dict(args)}
        t0 = time.perf_counter()
        out = None
        with db.track() as tr:
            try:
                out = self.box.call(name, dict(args))
                text, n = ask._trim(out)
                entry.update(rows=n)
            except ask.NotInGraph as e:
                text = json.dumps({"error": str(e)})
                entry.update(rows=0, error=str(e))
        entry.update(ms=round((time.perf_counter() - t0) * 1000), queries=tr.ran, ids=sorted(set(ask.ID.findall(text))))
        self.seen.update(entry["ids"])
        self.trace.append(entry)
        return out

    def result(self, answer: str) -> dict:
        used = sorted(set(ask.ID.findall(answer)))
        path_ids = sorted({p for path in self.box.paths for p in path})
        nodes = {p["pair_id"]: {"city": p["city"], "organ": p["organ"], "status": p["status"]}
                 for p in (programs.pairs(ids=path_ids) if path_ids else [])}
        paths, keys = [], set()
        for p in self.box.paths:
            if tuple(p) not in keys:
                keys.add(tuple(p))
                paths.append(p)
        return {"answer": answer, "draft_replaced": False, "unverified_ids": [i for i in used if i not in self.seen],
                "verified_ids": [i for i in used if i in self.seen], "trace": self.trace, "paths": paths[:8], "nodes": nodes,
                "from_memory": ask._dedupe(self.box.memory), "remembered_as": None, "provider": "graph", "model": MODEL,
                "stop_reason": "end_turn", "usage": {"input_tokens": 0, "output_tokens": 0, "cache_read_input_tokens": 0},
                "ms": round((time.perf_counter() - self.t0) * 1000), "example": True}


def _route(pairs: list[str], nodes: dict) -> str:
    return " → ".join(f"{nodes.get(p, {}).get('city', p)} ({p})" for p in pairs + pairs[:1])


def _shallow_then_deep(v: Viewer) -> dict | None:
    """The same question at two depths: the blog's depth 1 vs depth 4 moment. Prefers a family only a 3-way swap can help;
    otherwise the family where looking one hop deeper finds the most extra swaps."""
    waiting = [p["pair_id"] for p in programs.pairs() if p["status"] == "waiting" and p["organ"] == "kidney"
               and not personas.by_pair(p["pair_id"])]
    probe, best_pid, best_key = ask.ToolBox(v), None, None
    for pid in waiting[:40]:
        a, c = probe.find_loops_for(pid, 2)["found"], probe.find_loops_for(pid, 3)["found"]
        key = (a == 0 and c > 0, c - a)
        if c > a and (best_key is None or key > best_key):
            best_pid, best_key = pid, key
    if not best_pid:
        return _reach(v, waiting)
    pid = best_pid
    r = _Run(v)
    two = r.call("find_loops_for", {"pair_id": pid, "max_size": 2})
    three = r.call("find_loops_for", {"pair_id": pid, "max_size": 3})
    out = r.result("")
    city = programs.pairs(ids=[pid])[0]["city"]
    deep = [l for l in three["best"] if l["size"] == 3]
    best3 = deep[0] if deep else three["best"][0]
    if two["found"] == 0:
        first = (f"**A 2-way search finds nothing** for {city}'s {pid}: no waiting kidney family's donor fits {pid}'s "
                 f"patient while {pid}'s donor fits theirs.")
    else:
        b2 = two["best"][0]
        first = (f"**A 2-way search finds {two['found']} swap{'s' if two['found'] != 1 else ''}** for {city}'s {pid}. The "
                 f"best is {_route(b2['pairs'], out['nodes'])}, with a {round(b2['p_all'] * 100)}% chance both donations work.")
    out["answer"] = (
        f"{first}\n\n**One hop deeper, the search finds {three['found'] - two['found']} more**: 3-way swaps, where the "
        f"third family is two donations away. The strongest is {_route(best3['pairs'], out['nodes'])} "
        f"({round(best3['p_all'] * 100)}% that every donation works; each link's estimate multiplied).\n\n"
        f"That is why the agents search 2-way first and then 3-way: a 3-way swap is a cycle through families a simple "
        f"lookup never reaches, and when a 2-way swap doesn't exist, it is the only way to help.")
    return {"q": f"Find a swap for {city}'s {pid}: 2-way first, then 3-way.", "r": out}


def _reach(v: Viewer, waiting: list[str]) -> dict | None:
    """When every 3-way swap is already in use, the same depth contrast as reach: 1 donation away, then 3."""
    probe, pick = ask.ToolBox(v), None
    for pid in waiting[:20]:
        near, far = probe.reachable_within(pid, 1)["reachable"], probe.reachable_within(pid, 3)["reachable"]
        if near and (pick is None or far - near > pick[1]):
            pick = (pid, far - near)
    if not pick:
        return None
    pid = pick[0]
    r = _Run(v)
    near = r.call("reachable_within", {"pair_id": pid, "hops": 1})
    far = r.call("reachable_within", {"pair_id": pid, "hops": 3})
    city = programs.pairs(ids=[pid])[0]["city"]
    out = r.result("")
    by = far["by_hops"]
    route = next((x["route"] for x in far["routes"] if x["hops"] == max(by)), None) if by else None
    out["answer"] = (
        f"**Within 1 donation**, {city}'s {pid} donor can reach {near['reachable']} waiting kidney "
        f"famil{'y' if near['reachable'] == 1 else 'ies'}: those whose patient the donor fits directly.\n\n"
        f"**Within 3 donations** the reach grows to {far['reachable']}: "
        + ", ".join(f"{by[h]} at {h} hop{'s' if int(h) != 1 else ''}" for h in sorted(by, key=int)) + ". "
        + (f"For example, {' → '.join(route)}: each arrow is one family's donor giving to the next family's patient. " if route else "")
        + "\n\nThat is the reach a 3-way swap draws on. Right now every 3-way swap among waiting families is already in "
          "the weekly plan, so the agents look this deep again whenever a family joins or a link fails.")
    return {"q": f"How many waiting families can {city}'s {pid} donor reach within 1 donation, and within 3?", "r": out}


def _hardest(v: Viewer) -> dict:
    r = _Run(v)
    m = r.call("match_ease", {"limit": 5})
    hard = m["hardest"] or m["easiest"][::-1]
    lines = "\n".join(f"- {x['city']}'s {x['pair_id']} ({x['organ']})" for x in hard)
    easy = m["easiest"][0]
    out = r.result(
        f"PageRank over the compatibility links ranks all {m['waiting']} waiting families. The five hardest to place in a "
        f"swap, because the fewest donors can reach their patient:\n{lines}\n\n"
        f"For contrast, the easiest is {easy['city']}'s {easy['pair_id']}. The matching agent can put the hardest-to-match "
        f"families first, since an easy family will usually find another swap and a hard one may not.")
    return {"q": "Which waiting families are hardest to match?", "r": out}


def _withdrawal(v: Viewer) -> dict | None:
    loops = db.raw("MATCH (p:Pair)-[:IN_LOOP]->(l:Loop) WHERE l.status IN ['offered', 'testing', 'committee'] "
                   "AND l.kind = '3-way' RETURN p.pair_id AS pair, l.loop_id AS loop ORDER BY loop LIMIT 1")
    if not loops:
        return None
    pid = "P-0211" if db.raw("MATCH (:Pair {pair_id: 'P-0211'})-[:IN_LOOP]->(l:Loop) WHERE l.status IN "
                             "['offered', 'testing', 'committee'] RETURN l.loop_id AS loop") else loops[0]["pair"]
    r = _Run(v)
    w = r.call("withdrawal_impact", {"pair_id": pid})
    city = programs.pairs(ids=[pid])[0]["city"]
    parts = []
    for l in w["live_loops"]:
        others = [f for f in l["families"] if f != pid]
        fb = (f"Its stored fallback {l['fallback']} would {'survive' if l['fallback_survives'] else 'break too, because it also needs ' + pid}."
              if l.get("fallback") else "It has no stored fallback.")
        parts.append(f"- **{l['loop_id']}** ({l['kind']}, now {l['status']}) would break, and {', '.join(others)} would lose "
                     f"their transplant in it. {fb}")
    out = r.result(
        (f"If {city}'s {pid} withdraws:\n" + "\n".join(parts) +
         "\n\nThe matching agent would then search again around the families left behind, 2 hops out, skipping any link "
         "the graph remembers as failed.") if parts else f"{pid} isn't in a live swap, so nothing would break.")
    return {"q": f"What breaks if {city}'s {pid} withdraws?", "r": out}


def _memory(v: Viewer) -> dict | None:
    p = personas.get("sunita")
    if not p:
        return None
    r = _Run(v)
    m = r.call("patient_memory", {"pair_id": p["pair_id"]})
    if not m or not m.get("followed"):
        return None
    beliefs = "\n".join(f"- {b['now']} (since {b['since'][:10]}{', was: ' + b['before'] if b.get('before') else ''})"
                        for b in m["beliefs"])
    out = r.result(
        f"From {p['name']}'s memory graph (`{m['memory_graph']}`), what the health watch currently believes:\n{beliefs}\n\n"
        f"Each belief is a Fact node that replaced the one before it, so the graph keeps what changed and when. This answer "
        f"comes from memory, not a fresh traversal, so the dates matter: they say how current it is.")
    return {"q": f"What do the agents remember about {p['name'].split()[0]}?", "r": out}


def _unknown(v: Viewer) -> dict:
    r = _Run(v)
    r.call("withdrawal_impact", {"pair_id": "P-9999"})
    out = r.result("P-9999 is not in the graph, so no search ran: there is no family with that id in the pool. "
                   "Nothing was guessed. Check the id on the family's page, or ask about a family by its city.")
    return {"q": "What happens if P-9999 withdraws?", "r": out}


def build(v: Viewer) -> list[dict]:
    out = []
    for fn in (_shallow_then_deep, _hardest, _withdrawal, _memory, _unknown):
        try:
            x = fn(v)
        except ask.NotInGraph:
            x = None
        if x:
            out.append(x)
    return out

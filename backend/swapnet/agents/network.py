"""The agents as a graph (the Agents page): who works, what drives each one, which graphs it reads and writes, the open
hand-offs between agents, and a live feed of what they just did.

Everything is read from FalkorDB, nothing is typed in: `Agent` nodes, `Decision -[:MADE_BY]-> Agent` (with what each
decision read first and who wrote it), `Task -[:ASSIGNED_TO]-> Agent`, the `Event` feed, the `Question` nodes Ask
KindRed remembers, and the findings in each demo patient's memory graph. Agents never call each other: every edge on
the page goes through a graph, which is the point the picture makes."""
import json
import re
import time

from swapnet import config, personas
from swapnet.agents import recall, watch
from swapnet.graph import db

# Each agent: what drives it, and what it does. The counts and edges come from the graph; only this text is fixed.
ROSTER = [
    {"id": "intake", "label": "Intake agents", "driver": "rules", "agent": "Intake agent",
     "does": "One per hospital. Publishes each new family's de-identified facts from the hospital's private graph to the "
             "shared pool, and builds the family's compatibility links."},
    {"id": "matching", "label": "Matching agent", "driver": "rules", "agent": "Matching agent",
     "does": "Searches the pool for 2- and 3-way swaps, and searches again when a link fails or new families join. Reads "
             "the failure memory first, so a link that failed is never proposed again."},
    {"id": "crossmatch", "label": "Crossmatch coordinator", "driver": "rules", "agent": "Crossmatch coordinator",
     "does": "Orders the lab test for every link of an offered swap and records each result. A failed test becomes a "
             "FAILED link in the graph; overdue tests are chased."},
    {"id": "committee", "label": "Committee clerk", "driver": "rules", "agent": "Committee clerk",
     "does": "Checks every swap's committee papers against the 42-day target, reminds the hospital that is missing one, "
             "and escalates to a person when a swap is about to miss it."},
    {"id": "human", "label": "Exchange coordinator", "driver": "person", "agent": "Exchange coordinator (person)",
     "does": "The person in the loop. Approves the repairs and escalations the agents raise; every approval is stored "
             "on the decision it approved."},
    {"id": "liaison", "label": "Patient liaison", "driver": "rules", "agent": "Patient liaison",
     "does": "Writes the family a plain message about where their case stands, when the health watch hands it the task."},
    {"id": "scheduler", "label": "Scheduler", "driver": "rules", "agent": "Scheduler",
     "does": "Holds appointments in the hospital's private graph when the health watch asks, and books surgery once the "
             "committee file is complete."},
    {"id": "health", "label": "Health watch", "driver": "rules", "agent": "Health watch",
     "does": "Reads each new lab result for the demo patients, updates what it believes about them (stage, trend, "
             "projection), and hands one task per playbook step to the other agents."},
    {"id": "coordinator", "label": "Coordinator agent", "driver": "model", "agent": "Coordinator agent",
     "does": "A language model, once a simulated week for each demo patient. Lists its case tools from KindRed's MCP "
             "server, reads the patient's memory, and picks one action: search 2-way then 3-way, form a swap, order "
             "tests, request papers or book surgery."},
    {"id": "ask", "label": "Ask KindRed", "driver": "model", "agent": "Ask KindRed",
     "does": "A language model answering people's questions (and Kin's patient chats) with 15 read-only graph tools. "
             "Every id it names is checked against the graph; verified answers are stored as memory."},
]
_BY_AGENT = {r["agent"]: r["id"] for r in ROSTER}
_WRITER = re.compile(r"\(from (.+?)\):")


def _agent_id(name: str | None) -> str | None:
    """The roster node an agent name belongs to ("Intake agent · Pune" -> intake, "Lab · Pune" -> the hospitals)."""
    if not name:
        return None
    if name.startswith("Intake agent"):
        return "intake"
    if name.startswith("Lab ·") or name.startswith("Hospitals") or name == "Hospital records":
        return "hospitals"
    return _BY_AGENT.get(name)


def _task_creator(kind: str) -> str:
    return {"handoff": "health", "committee_escalation": "committee"}.get(kind, "matching")


def build(feed_limit: int = 40) -> dict:
    now = int(time.time() * 1000)
    nodes: dict[str, dict] = {}
    edges: dict[tuple[str, str, str], dict] = {}

    def edge(a: str, b: str, kind: str, n: int, what: str) -> None:
        if not n:
            return
        e = edges.setdefault((a, b, kind), {"from": a, "to": b, "kind": kind, "n": 0, "what": []})
        e["n"] += n
        if what not in e["what"]:
            e["what"].append(what)

    for r in ROSTER:
        nodes[r["id"]] = {"id": r["id"], "type": "agent", "label": r["label"], "driver": r["driver"], "does": r["does"],
                          "decisions": 0, "events": 0, "open_tasks": 0, "last": None, "members": []}
    # The graphs the agents share. Agents only ever meet here.
    mem = [(p, personas.memory_graph(p)) for p in personas.ids() if db.exists(personas.memory_graph(p))]
    hosp = [g for g in db.graphs() if g.startswith("hosp_")]
    nodes["exchange"] = {"id": "exchange", "type": "graph", "label": "Shared pool", "graph": config.EXCHANGE,
                         "does": "The exchange graph every agent reads and writes: families, compatibility links, swaps, "
                                 "offers, tests, failures, decisions, hand-off tasks and the event feed."}
    nodes["hospitals"] = {"id": "hospitals", "type": "graph", "label": f"{len(hosp)} hospital graphs", "graph": "hosp_*",
                          "does": "One private graph per hospital: names, documents, full tissue typing, lab results and "
                                  "appointments. Only de-identified facts leave them, through the intake agents."}
    for pid, g in mem:
        nodes[f"mem:{pid}"] = {"id": f"mem:{pid}", "type": "graph", "label": f"{personas.get(pid)['name'].split()[0]}'s memory",
                               "graph": g, "does": f"{personas.get(pid)['name']}'s memory graph: readings assessed, beliefs "
                                                   "with what they replaced, playbooks, findings, swap searches."}

    # Agents as stored: members of the intake group, decisions and their reads, events, tasks.
    for a in db.raw("MATCH (a:Agent) RETURN a.name AS name"):
        aid = _agent_id(a["name"])
        if aid == "intake":
            nodes["intake"]["members"].append(a["name"].split("· ", 1)[-1])
    for r in db.raw("MATCH (d:Decision)-[:MADE_BY]->(a:Agent) RETURN a.name AS a, count(d) AS n, max(d.at) AS at"):
        aid = _agent_id(r["a"])
        if aid in nodes:
            nodes[aid]["decisions"] += r["n"]
            edge(aid, "exchange", "writes", r["n"], "decisions")
            if aid == "intake":
                edge("hospitals", aid, "reads", r["n"], "new families from each hospital's private graph")
    for r in db.raw("MATCH (d:Decision)-[:APPROVED_BY]->(a:Agent) RETURN count(d) AS n"):
        edge("human", "exchange", "writes", r["n"], "approvals")
    for r in db.raw("MATCH (d:Decision)-[:MADE_BY]->(a:Agent) WHERE size(d.read) > 0 UNWIND d.read AS line "
                    "RETURN a.name AS a, line"):
        reader, m = _agent_id(r["a"]), _WRITER.search(r["line"])
        writer = _agent_id(m.group(1)) if m else None
        if reader in nodes and writer:
            src = "exchange" if writer in ("crossmatch", "matching", "committee", "human") else (
                "hospitals" if writer == "hospitals" else next((f"mem:{p}" for p, _ in mem), "exchange"))
            edge(src, reader, "reads", 1, f"{nodes.get(writer, {}).get('label', m.group(1))}'s memory")

    events = db.raw("MATCH (e:Event) WITH e ORDER BY e.seq DESC WITH e.agent AS a, count(e) AS n, collect(e)[0] AS last "
                    "RETURN a, n, last.text AS text, last.at AS at")
    for r in events:
        aid = _agent_id(r["a"])
        if aid in nodes and nodes[aid]["type"] == "agent":
            nodes[aid]["events"] += r["n"]
            if not nodes[aid]["last"] or r["at"] > nodes[aid]["last"]["at"]:
                nodes[aid]["last"] = {"text": r["text"], "at": r["at"]}
        elif aid == "hospitals":
            edge("hospitals", "health", "reads", r["n"], "new lab results")

    tasks = db.raw("""MATCH (t:Task)-[:ASSIGNED_TO]->(g:Agent) OPTIONAL MATCH (t)-[:ABOUT]->(x)
                      RETURN t.kind AS kind, coalesce(t.action, t.kind) AS action, t.status AS status, g.name AS agent,
                             count(t) AS n, collect(coalesce(x.loop_id, x.pair_id))[0..4] AS about, max(t.created_at) AS at""")
    for t in tasks:
        to, by = _agent_id(t["agent"]), _task_creator(t["kind"])
        if to not in nodes:
            continue
        edge(by, "exchange", "writes", t["n"], "hand-off tasks")
        if t["status"] == "open":
            nodes[to]["open_tasks"] += t["n"]
            tid = f"task:{by}:{to}:{t['action']}"
            nodes[tid] = {"id": tid, "type": "task", "label": f"{t['n']} open: {t['action'].replace('_', ' ')}", "from": by,
                          "to": to, "n": t["n"], "about": [a for a in t["about"] if a], "at": t["at"],
                          "does": f"Task nodes in the shared pool: {nodes[by]['label']} wrote them, {nodes[to]['label']} "
                                  "picks them up from the graph on its next turn."}
            edge(by, tid, "hands", t["n"], "writes the task")
            edge(tid, to, "hands", t["n"], "picks it up")
        else:
            edge("exchange", to, "reads", t["n"], f"{t['action'].replace('_', ' ')} tasks it picked up")

    q = db.raw("MATCH (q:Question) RETURN count(q) AS n, max(q.at) AS at")
    if q and q[0]["n"]:
        edge("ask", "exchange", "writes", q[0]["n"], "remembered answers (Question nodes)")
        nodes["ask"]["decisions"] = q[0]["n"]
        nodes["ask"]["last"] = {"text": f"{q[0]['n']} verified answer{'s' if q[0]['n'] != 1 else ''} remembered", "at": q[0]["at"]}
    edge("exchange", "ask", "reads", 1, "15 read-only tools over the pool")

    # The demo patients' memory graphs: who wrote each finding, and what each step read first.
    feed_extra = []
    for pid, g in mem:
        node = f"mem:{pid}"
        rows = db.raw("MATCH (:Person)-[:HAS_FINDING]->(f:Finding) RETURN f.kind AS kind, f.read AS read, f.at AS at, "
                      "f.created AS created, f.text AS text, f.trace AS trace", graph=g)
        for f in rows:
            writer = _agent_id(recall.FINDING_WRITER.get(f["kind"]))
            if writer in nodes:
                edge(writer, node, "writes", 1, f"{f['kind'].replace('_', ' ')} findings")
            for item in json.loads(f["read"]) if f.get("read") else []:
                src = _agent_id(item.get("written_by"))
                if writer in nodes and src:
                    edge(node if src in ("health", "coordinator") else "exchange" if src != "hospitals" else "hospitals",
                         writer, "reads", 1, f"{item.get('memory')} (from {item.get('written_by')})")
            if f["kind"] in ("decision", "case") and f.get("created"):
                via = "over MCP" if f.get("trace") and '"via": "mcp"' in f["trace"] else ""
                feed_extra.append({"at": f["created"], "pair": personas.get(pid)["pair_id"], "via": via,
                                   "why": f["text"].split(": ", 1)[-1] if f["text"].startswith("Coordinator agent") else f["text"]})
        edge("health", node, "writes", 1, "beliefs (Fact nodes that supersede the old ones)")
        edge(node, "coordinator", "reads", 1, f"{personas.get(pid)['name'].split()[0]}'s beliefs and findings")
        edge(node, "ask", "reads", 1, "patient memory (Kin's chats)")
    if "scheduler" in nodes:
        edge("scheduler", "hospitals", "writes", 1, "appointments")
    edge("hospitals", "health", "reads", 1, "the demo patients' lab results")

    feed = [{"at": e["at"], "agent": e["agent"], "node": _agent_id(e["agent"]), "text": e["text"], "kind": e["kind"]}
            for e in db.raw("MATCH (e:Event) RETURN e.at AS at, e.agent AS agent, e.text AS text, e.kind AS kind "
                            "ORDER BY e.seq DESC LIMIT $n", {"n": feed_limit})]
    # Each coordinator week is one feed line: what it did (the event) with the model's reason and how it called its
    # tools (from the finding in the patient's memory graph).
    for x in feed_extra:
        near = [f for f in feed if f["node"] == "coordinator" and f["text"].startswith(x["pair"]) and abs(f["at"] - x["at"]) < 10_000
                and "why" not in f]
        if near:
            near[0].update(why=x["why"], via=x["via"])

    interval = watch.state.get("interval_s") or 30
    for n in nodes.values():
        last = (n.get("last") or {}).get("at") or 0
        n["active"] = n["type"] == "agent" and now - last < 2 * interval * 1000
    ws = watch.state
    return {
        "nodes": list(nodes.values()),
        "edges": [{**e, "what": e["what"][:4]} for e in edges.values()],
        "feed": feed,
        "watch": {"enabled": ws.get("enabled"), "interval_s": interval, "sweeps": ws.get("sweeps"),
                  "last_at": ws.get("last_at"), "running": ws.get("running"), "paused": watch.paused(),
                  "last_actions": (ws.get("worlds") or {}).get(db.world(), ws.get("last_actions") or []),
                  "autoplay_until": ws["autoplay"].get(db.world()), "busy": bool(ws["busy"].get(db.world()))},
        "now": now,
    }

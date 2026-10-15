"""HTTP API for the KindRed web app. Every response that comes from the graph carries the
named queries that produced it (`queries`), so the UI can show the Cypher."""
import json
import threading
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from swapnet import config, scenario
from contextlib import asynccontextmanager

from swapnet.agents import core, watch
from swapnet.graph import db


@asynccontextmanager
async def lifespan(_app):
    watch.start()
    yield
    watch.stop()


app = FastAPI(title="KindRed API", description="Synthetic demo data. No real patients.", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
_busy = threading.Lock()

ACTIVE = ["selected", "offered", "testing", "committee", "locked", "broken"]


@app.get("/api/health")
def health():
    db.db().connection.ping()
    return {"ok": True}


@app.post("/api/demo/reset")
def reset():
    if not _busy.acquire(blocking=False):
        raise HTTPException(409, "a reset is already running")
    try:
        with core.LOCK:
            r = scenario.load()
        return {"ok": True, "seed": r["seed"], "pairs": r["pairs"], "plan": _plan_brief(r["plan"])}
    finally:
        _busy.release()


@app.post("/api/demo/add-chennai")
def add_chennai():
    with core.LOCK:
        return scenario.add_chennai()


def _plan_brief(p: dict) -> dict:
    return {k: p[k] for k in ("run_id", "optimal", "solve_ms", "expected_tx", "planned_tx", "candidates", "components", "queries")}


@app.post("/api/plan/run")
def run_plan():
    with core.LOCK:
        return _plan_brief(core.MatchingAgent().run_plan())


@app.get("/api/pool")
def pool():
    with db.track() as tr:
        tiles = db.run("Q20_pool_summary")[0]
        comps = db.run("Q07_components")
    hospitals = db.raw("MATCH (h:Hospital) OPTIONAL MATCH (h)<-[:REGISTERED_AT]-(p:Pair) "
                       "RETURN h.code AS code, h.city AS city, h.lat AS lat, h.lon AS lon, count(p) AS pairs ORDER BY code")
    plan = db.raw("MATCH (p:Plan) WHERE NOT p.run_id STARTS WITH 'repair' AND NOT p.run_id STARTS WITH 'rematch' "
                  "RETURN p ORDER BY p.at DESC LIMIT 1")
    loops = _loops()
    with db.track() as tr2:
        links = db.run("Q24_loop_links", {"loop_ids": [l["loop_id"] for l in loops]})
        bridges = db.run("Q19_bridge_pairs", {"limit": 5})
    tr.ran += tr2.ran
    broken = sum(1 for l in loops if l["status"] == "broken")
    return {
        "tiles": {**tiles, "loops": len([l for l in loops if l["status"] != "broken"]), "broken": broken,
                  "expected_tx": round(sum(l["expected_tx"] for l in loops if l["status"] != "broken"), 1),
                  "planned_tx": sum(len(l["pairs"]) for l in loops if l["status"] != "broken"),
                  "components": len(comps)},
        "hospitals": hospitals,
        "plan": plan[0]["p"].properties if plan else None,
        "loops": loops,
        "links": links,
        "demo": _demo_story(),
        "bridges": bridges,
        "open_tasks": _tasks(),
        "escalations": _escalations(),
        "queries": tr.ran,
    }


def _loops() -> list[dict]:
    rows = db.raw("""MATCH (p:Pair)-[r:IN_LOOP]->(l:Loop) WHERE l.status IN $s
                     MATCH (p)-[:REGISTERED_AT]->(h:Hospital)
                     WITH l, p, h ORDER BY r.pos
                     OPTIONAL MATCH (l)-[:REPLACED_BY]->(n:Loop)
                     RETURN l.loop_id AS loop_id, l.kind AS kind, l.status AS status, l.p_success AS p_success,
                            l.expected_tx AS expected_tx, l.has_fallback AS has_fallback, l.created_at AS created_at,
                            n.loop_id AS replaced_by,
                            collect({pair_id: p.pair_id, code: h.code, city: h.city, lat: h.lat, lon: h.lon}) AS pairs
                     ORDER BY l.created_at DESC, loop_id""", {"s": ACTIVE})
    return rows


def _demo_story() -> dict:
    """Where the scripted demo stands, so the web app can suggest the next step."""
    r = db.raw("""OPTIONAL MATCH (c:Pair {pair_id: 'P-0377'})
                  OPTIONAL MATCH (:Pair {pair_id: 'P-0154'})-[:IN_LOOP]->(l:Loop) WHERE l.status <> 'fallback'
                  WITH c, l ORDER BY l.created_at
                  RETURN c IS NOT NULL AS chennai, collect({id: l.loop_id, status: l.status}) AS loops""")
    row = r[0] if r else {"chennai": False, "loops": []}
    loops = [l for l in row["loops"] if l.get("id")]
    hero = loops[0] if loops else None
    now = loops[-1] if loops else None
    return {"chennai_added": bool(row["chennai"]), "hero_loop": hero and hero["id"], "hero_status": hero and hero["status"],
            "repaired_into": now["id"] if now and hero and now["id"] != hero["id"] else None,
            "family_pair": "P-0154", "new_family_pair": "P-0377"}


def _tasks() -> list[dict]:
    """Repairs waiting for a person's decision."""
    return db.raw("MATCH (t:Task {status: 'open'})-[:ABOUT]->(l:Loop) WHERE t.kind IN ['approve_repair', 'escalate'] "
                  "RETURN t.task_id AS task_id, t.kind AS kind, l.loop_id AS loop_id, t.created_at AS at ORDER BY at DESC")


def _escalations() -> list[dict]:
    """Committee files the clerk escalated to the coordinator."""
    rows = db.raw("MATCH (t:Task {status: 'open', kind: 'committee_escalation'})-[:ABOUT]->(l:Loop) "
                  "RETURN t.task_id AS task_id, l.loop_id AS loop_id, t.created_at AS at, t.payload AS p ORDER BY at DESC")
    return [{**{k: r[k] for k in ("task_id", "loop_id", "at")}, **json.loads(r["p"])} for r in rows]


@app.get("/api/loops/{loop_id}")
def loop_detail(loop_id: str):
    with db.track() as tr:
        links = db.run("Q13_explain_loop", {"loop_id": loop_id})
        if not links:
            raise HTTPException(404, "no such loop")
        fams = db.raw("""MATCH (p:Pair)-[r:IN_LOOP]->(:Loop {loop_id: $l})
                         MATCH (p)-[:REGISTERED_AT]->(h:Hospital), (p)-[:HAS_DONOR]->(d:Donor), (p)-[:HAS_PATIENT]->(t:Patient)
                         RETURN p.pair_id AS pair_id, h.city AS city, h.code AS code, d.abo AS donor_abo,
                                d.relation AS donor_relation, d.untyped_loci AS untyped, t.abo AS patient_abo,
                                t.cpra AS cpra, p.failed_count AS failed_count ORDER BY r.pos""", {"l": loop_id})
        for f in fams:
            from swapnet.gen.generator import abo_ok
            f["own_clash"] = "blood groups clash" if not abo_ok(f["donor_abo"], f["patient_abo"]) else "tissue-type clash"
        meta = db.raw("""MATCH (l:Loop {loop_id: $l}) OPTIONAL MATCH (l)-[:REPLACED_BY]->(n:Loop)
                         OPTIONAL MATCH (o:Loop)-[:REPLACED_BY]->(l)
                         OPTIONAL MATCH (fb:Loop)-[:FALLBACK_FOR]->(l)
                         RETURN l AS l, n.loop_id AS replaced_by, o.loop_id AS replaces, fb.loop_id AS fallback""", {"l": loop_id})[0]
        workflow = _workflow(loop_id, links)
        readiness = core.CommitteeClerk().readiness(loop_id)
        failures = db.raw("MATCH (f:Failure)-[:BROKE]->(:Loop {loop_id: $l}) RETURN f.failure_id AS id", {"l": loop_id})
        trail_ids = [loop_id] + [x for x in (meta["replaced_by"], meta["replaces"]) if x]
        trail = db.run("Q14_decision_trail", {"loop_ids": trail_ids, "failure_ids": [f["id"] for f in failures],
                                              "pair_ids": []})
        task = db.raw("""MATCH (t:Task)-[:ABOUT]->(l:Loop) WHERE l.loop_id IN $ids AND t.kind IN ['approve_repair', 'escalate']
                         RETURN t.task_id AS task_id, t.kind AS kind, t.status AS status, t.payload AS payload, t.result AS result,
                                t.declined_by AS declined_by, t.done_at AS done_at
                         ORDER BY t.created_at DESC LIMIT 1""", {"ids": trail_ids})
    proposal = None
    if task:
        proposal = {**json.loads(task[0]["payload"]), "task_id": task[0]["task_id"], "kind": task[0]["kind"],
                    "status": task[0]["status"], "result": task[0]["result"], "declined_by": task[0]["declined_by"],
                    "done_at": task[0]["done_at"]}
    return {"loop": meta["l"].properties, "replaced_by": meta["replaced_by"], "replaces": meta["replaces"],
            "fallback": meta["fallback"], "families": fams, "links": links, "workflow": workflow,
            "committee": readiness, "decisions": trail, "proposal": proposal, "queries": tr.ran}


def _workflow(loop_id: str, links: list[dict]) -> list[dict]:
    offers = {r["p"]: r["resp"] for r in db.raw(
        "MATCH (o:Offer)-[:FOR]->(:Loop {loop_id: $l}) MATCH (o)-[:TO]->(p:Pair) RETURN p.pair_id AS p, o.response AS resp",
        {"l": loop_id})}
    tests = {(r["a"], r["b"]): r for r in db.raw(
        """MATCH (x:Crossmatch)-[:IN]->(:Loop {loop_id: $l}) MATCH (x)-[:DONOR_OF]->(a:Pair), (x)-[:PATIENT_OF]->(b:Pair)
           RETURN a.pair_id AS a, b.pair_id AS b, x.result AS result, x.antibody AS antibody, x.test_id AS test_id, x.due_at AS due""",
        {"l": loop_id})}
    out = []
    for l in links:
        a, b = l["from_pair"], l["to_pair"]
        accepted = [offers.get(a), offers.get(b)]
        t = tests.get((a, b))
        out.append({"link": f"{l['from_city']} → {l['to_city']}", "from_pair": a, "to_pair": b,
                    "offered": bool(offers), "accepts": sum(1 for x in accepted if x == "accept"),
                    "holds": sum(1 for x in accepted if x == "hold"),
                    "test": t and ("done" if t["result"] != "pending" else "requested"),
                    "result": t and t["result"], "antibody": t and t["antibody"], "due": t and t["due"]})
    return out


@app.get("/api/committee")
def committee():
    """Committee readiness for every loop that is past matching, most urgent first."""
    with db.track() as tr:
        rows = [l for l in _loops() if l["status"] in ("testing", "committee", "locked", "offered")]
        out = []
        for l in rows:
            r = core.CommitteeClerk().readiness(l["loop_id"])
            days_left = min((p["days_left"] for p in r["pairs"]), default=None)
            out.append({**l, "committee": r, "days_left": days_left,
                        "ready": all(not p["missing"] for p in r["pairs"])})
    out.sort(key=lambda x: (x["ready"], x["days_left"] if x["days_left"] is not None else 999))
    return {"loops": out, "queries": tr.ran}


@app.post("/api/loops/{loop_id}/lab")
def run_lab(loop_id: str):
    with core.LOCK, db.track() as tr:
        res = core.CrossmatchCoordinator().run_lab(loop_id)
    return {"results": res, "queries": tr.ran}


@app.post("/api/loops/{loop_id}/chase")
def chase(loop_id: str):
    with core.LOCK:
        step = core.CommitteeClerk().chase(loop_id)
    return {"ok": True, "step": step}


class Approve(BaseModel):
    choice: str = "recommended"


@app.post("/api/tasks/{task_id}/approve")
def approve(task_id: str, body: Approve):
    with core.LOCK:
        r = core.MatchingAgent().approve(task_id, body.choice)
    if "error" in r:
        raise HTTPException(400, r["error"])
    return r


class Decline(BaseModel):
    reason: str


@app.post("/api/tasks/{task_id}/decline")
def decline(task_id: str, body: Decline):
    if not body.reason.strip():
        raise HTTPException(400, "a reason is required")
    with core.LOCK:
        r = core.MatchingAgent().decline(task_id, body.reason.strip())
    if "error" in r:
        raise HTTPException(400, r["error"])
    return r


@app.get("/api/agents")
def agents():
    """What the background watch has been doing."""
    return watch.state


@app.post("/api/agents/sweep")
def agents_sweep():
    """Run the watch now instead of waiting for the next tick."""
    return watch.sweep()


@app.get("/api/family/{pair_id}")
def family(pair_id: str, lang: str = "en"):
    r = core.family_status(pair_id, lang)
    if "error" in r:
        raise HTTPException(404, r["error"])
    return r


@app.get("/api/hospital/{code}")
def hospital(code: str):
    """One hospital's private view: its own pairs, and the loops it could make on its own."""
    code = code.upper()
    g = config.hospital_graph(code)
    pairs = db.raw("MATCH (p:Pair)-[:PATIENT]->(r:Person) OPTIONAL MATCH (p)-[:NEEDS_DOC]->(d:Document {status: 'missing'}) "
                   "RETURN p.pair_id AS pair_id, r.name AS patient, p.published AS published, count(d) AS missing_docs "
                   "ORDER BY pair_id", graph=g)
    ids = [p["pair_id"] for p in pairs]
    with db.track() as tr:
        rows = db.run("Q04_two_way_loops", {"ids": ids}) + db.run("Q05_three_way_loops", {"ids": ids})
    alone = [r for r in rows if set(r["pairs"]) <= set(ids)]
    return {"code": code, "pairs": pairs, "loops_alone": len(alone), "queries": tr.ran}


@app.get("/api/events")
def events(since: int = 0):
    return db.run("Q18_events_since", {"since": since})


@app.get("/api/queries")
def queries():
    return db.all_queries()


@app.get("/api/sim")
def sim():
    p = config.DATA / "generated" / "sim_results.json"
    if not p.exists():
        return {"ready": False}
    return {"ready": True, **json.loads(p.read_text(encoding="utf-8"))}


@app.get("/api/graph/overview")
def graph_overview():
    """What lives in FalkorDB right now, and which named queries have been running against it."""
    graphs = []
    for g in sorted(db.db().list_graphs()):
        if g != config.EXCHANGE and not g.startswith("hosp_"):
            continue
        nodes = db.raw("MATCH (n) RETURN labels(n)[0] AS label, count(*) AS n ORDER BY n DESC", graph=g)
        rels = db.raw("MATCH ()-[r]->() RETURN type(r) AS type, count(*) AS n ORDER BY n DESC", graph=g)
        graphs.append({"name": g, "nodes": nodes, "relationships": rels,
                       "node_total": sum(r["n"] for r in nodes), "rel_total": sum(r["n"] for r in rels)})
    stats: dict[str, dict] = {}
    for e in db.LOG:
        s = stats.setdefault(e["query"], {"runs": 0, "ms": []})
        s["runs"] += 1
        s["ms"].append(e["ms"])
    queries = []
    for name, text in db.all_queries().items():
        first = next((l.strip("/ ").strip() for l in text.splitlines() if l.strip().startswith("//")), "")
        s = stats.get(name)
        ms = sorted(s["ms"]) if s else []
        queries.append({"name": name, "about": first, "runs": s["runs"] if s else 0,
                        "p50_ms": ms[len(ms) // 2] if ms else None,
                        "p95_ms": ms[min(len(ms) - 1, int(len(ms) * 0.95))] if ms else None})
    return {"graphs": graphs, "queries": queries, "recent": list(db.LOG)[-40:][::-1], "tools": _mcp_tools()}


def _mcp_tools() -> list[dict]:
    """The MCP tools agents can choose from, read from the server module without starting it."""
    import ast
    src = Path(__file__).resolve().parents[1] / "mcp" / "server.py"
    out = []
    for node in ast.parse(src.read_text(encoding="utf-8")).body:
        if isinstance(node, ast.FunctionDef) and any("tool" in ast.unparse(d) for d in node.decorator_list):
            doc = " ".join((ast.get_docstring(node) or "").split())
            doc = doc.split(". ")[0].rstrip(".") + "."
            out.append({"name": node.name, "about": doc})
    return out

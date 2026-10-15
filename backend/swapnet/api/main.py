"""HTTP API for the KindRed web app. Every response that comes from the graph carries the
named queries that produced it (`queries`), so the UI can show the Cypher."""
import json
import re
import threading
from pathlib import Path

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from swapnet import access, config, organs, programs, scenario
from swapnet.access import Viewer
from contextlib import asynccontextmanager

import anthropic
import httpx

from swapnet.agents import ask as ask_agent
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


@app.get("/api/organs")
def organ_list():
    """The organs the exchange runs, for labels and filters in the web app."""
    return [{"name": o.name, "prefix": o.prefix, "test_name": o.test_name, "hospitals": o.hospitals()}
            for o in organs.ORGANS.values()]


def _organ(organ: str | None) -> str | None:
    try:
        return programs.check_organ(organ)
    except KeyError as e:
        raise HTTPException(400, str(e.args[0]))


def _program_visible(v: Viewer, organ: str) -> None:
    if organ not in v.programs():
        raise HTTPException(403, f"{v.name} has no access to the {organ} program")


def _loop_scope(loop_id: str) -> tuple[str, list[str]]:
    """A loop's organ and the hospitals of its families, for scope checks."""
    rows = db.raw("MATCH (p:Pair)-[:IN_LOOP]->(l:Loop {loop_id: $l}) MATCH (p)-[:REGISTERED_AT]->(h:Hospital) "
                  "RETURN l.organ AS o, collect(DISTINCT h.code) AS hs", {"l": loop_id})
    if not rows or rows[0]["o"] is None:
        raise HTTPException(404, "no such loop")
    return rows[0]["o"], rows[0]["hs"]


@app.get("/api/me")
def me(v: Viewer = Depends(access.viewer)):
    """The demo identity making requests, its role, programs and scope. There is no authentication."""
    return v.public()


@app.get("/api/programs")
def program_list(v: Viewer = Depends(access.viewer)):
    """The transplant programs this viewer can see, with live counts. One platform, one entry per organ."""
    loops = _loops()
    counts = {r["o"]: r for r in db.raw("MATCH (p:Pair) RETURN p.organ AS o, count(p) AS pairs, "
                                         "sum(CASE WHEN p.status = 'waiting' THEN 1 ELSE 0 END) AS waiting")}
    out = []
    for name in v.programs():
        live = [l for l in loops if l["organ"] == name and l["status"] != "broken"]
        out.append({**programs.program(name), "pairs": counts.get(name, {}).get("pairs", 0),
                    "waiting": counts.get(name, {}).get("waiting", 0), "loops": len(live),
                    "expected_tx": round(sum(l["expected_tx"] for l in live), 1)})
    return out


@app.get("/api/programs/{organ}")
def program_detail(organ: str, v: Viewer = Depends(access.viewer)):
    organ = _organ(organ)
    if organ is None:
        raise HTTPException(400, "name one program")
    _program_visible(v, organ)
    return {**programs.program(organ), "scenario_state": programs.scenario(organ)}


@app.get("/api/pairs")
def pair_list(organ: str | None = None, v: Viewer = Depends(access.viewer)):
    """Shared exchange facts per pair, in one program or every program the viewer can see."""
    organ = _organ(organ)
    if organ:
        _program_visible(v, organ)
    with db.track() as tr:
        rows = [r for r in programs.pairs(organ) if v.sees(r["code"], r["organ"])]
    return {"organ": organ, "pairs": rows, "privacy": "Shared exchange data only: no names, documents or clinical notes.",
            "queries": tr.ran}


@app.get("/api/exchanges")
def exchange_list(organ: str | None = None, v: Viewer = Depends(access.viewer)):
    """Loops (exchanges) in one program, or every program the viewer can see."""
    organ = _organ(organ)
    if organ:
        _program_visible(v, organ)
    return [l for l in _loops() if (organ is None or l["organ"] == organ)
            and all(v.sees(p["code"], l["organ"]) for p in l["pairs"])]


@app.get("/api/loops/{loop_id}/evidence")
@app.get("/api/exchanges/{loop_id}/evidence")
def loop_evidence(loop_id: str, v: Viewer = Depends(access.viewer)):
    organ, hs = _loop_scope(loop_id)
    v.require_scope(hs, organ)
    with db.track() as tr:
        ev = programs.evidence(loop_id)
    return {**ev, "queries": tr.ran}


@app.get("/api/matches")
def matches(organ: str, pair_id: str, v: Viewer = Depends(access.viewer)):
    """Possible donations to and from one pair inside its program. The organ is required and must match the pair."""
    organ = _organ(organ)
    if organ is None:
        raise HTTPException(400, "organ is required")
    _program_visible(v, organ)
    with db.track() as tr:
        rows = db.run("Q30_exchange_candidates", {"pair_id": pair_id, "organ": organ})
    if not rows:
        raise HTTPException(404, f"{pair_id} is not a {organ} pair")
    r = rows[0]
    return {**r, "gives": [g for g in r["gives"] if g], "receives": [x for x in r["receives"] if x], "queries": tr.ran}


@app.get("/api/integrity")
def integrity(organ: str | None = None, v: Viewer = Depends(access.viewer)):
    """Shared and program-specific workflow checks (never medical judgements)."""
    organ = _organ(organ)
    if organ:
        _program_visible(v, organ)
    out = programs.integrity(organ)
    out["findings"] = [f for f in out["findings"] if f["organ"] in v.programs() or f["organ"] is None]
    return out


@app.get("/api/simulations")
def simulations(organ: str | None = None, v: Viewer = Depends(access.viewer)):
    """Each program's demo scenario (initial state, failure event, repair strategy, review step) and its live state."""
    organ = _organ(organ)
    names = [organ] if organ else v.programs()
    for n in names:
        _program_visible(v, n)
    return [programs.scenario(n) for n in names]


@app.get("/api/audit")
def audit(organ: str | None = None, since: int = 0, v: Viewer = Depends(access.viewer)):
    """Events tagged with the program they belong to ('shared' when they span programs)."""
    organ = _organ(organ)
    if organ:
        _program_visible(v, organ)
    rows = _tag_events(db.run("Q18_events_since", {"since": since}))
    return [e for e in rows if organ is None or e["organ"] in (organ, "shared")]


_LOOP_REF = re.compile(r"\b([A-Z])-\d{4}\b")
_PAIR_REF = re.compile(r"\bP-\d{4}\b")


def _tag_events(rows: list[dict]) -> list[dict]:
    """Which program an event belongs to, from the loops and pairs it names (or the organ word it uses)."""
    pair_organ = {r["p"]: r["o"] for r in db.raw("MATCH (p:Pair) RETURN p.pair_id AS p, p.organ AS o")}
    prefix = {o.prefix: o.name for o in organs.ORGANS.values()}
    for e in rows:
        seen = {prefix[m + "-"] for m in _LOOP_REF.findall(e["text"]) if m + "-" in prefix}
        seen |= {pair_organ[p] for p in _PAIR_REF.findall(e["text"]) if p in pair_organ}
        if not seen:
            seen = {o for o in organs.names() if re.search(rf"\b{o}\b", e["text"], re.I)}
        e["organ"] = seen.pop() if len(seen) == 1 else "shared"
    return rows


@app.get("/api/pool")
def pool():
    with db.track() as tr:
        tiles = db.run("Q20_pool_summary", {"urgent_meld": organs.get("liver").params()["urgent_meld"]})[0]
        comps = db.run("Q07_components")
    # Organ counts from a collected list: sum(CASE ...) after this OPTIONAL MATCH counted every pair in FalkorDB.
    hospitals = db.raw("MATCH (h:Hospital) OPTIONAL MATCH (h)<-[:REGISTERED_AT]-(p:Pair) WITH h, collect(p.organ) AS os "
                       "RETURN h.code AS code, h.city AS city, h.lat AS lat, h.lon AS lon, size(os) AS pairs, "
                       "size([o IN os WHERE o = 'liver']) AS liver_pairs ORDER BY code")
    plan = db.raw("MATCH (p:Plan) WHERE NOT p.run_id STARTS WITH 'repair' AND NOT p.run_id STARTS WITH 'rematch' "
                  "RETURN p ORDER BY p.at DESC LIMIT 1")
    loops = _loops()
    with db.track() as tr2:
        links = db.run("Q24_loop_links", {"loop_ids": [l["loop_id"] for l in loops]})
        bridges = db.run("Q19_bridge_pairs", {"limit": 5})
    tr.ran += tr2.ran
    broken = sum(1 for l in loops if l["status"] == "broken")
    live = [l for l in loops if l["status"] != "broken"]
    by_organ = {o: {"loops": len([l for l in live if l["organ"] == o]),
                    "expected_tx": round(sum(l["expected_tx"] for l in live if l["organ"] == o), 1),
                    "planned_tx": sum(len(l["pairs"]) for l in live if l["organ"] == o)} for o in organs.names()}
    return {
        "tiles": {**tiles, "loops": len(live), "broken": broken,
                  "expected_tx": round(sum(l["expected_tx"] for l in live), 1),
                  "planned_tx": sum(len(l["pairs"]) for l in live),
                  "components": len(comps)},
        "by_organ": by_organ,
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
                     RETURN l.loop_id AS loop_id, coalesce(l.organ, 'kidney') AS organ, l.kind AS kind, l.status AS status, l.p_success AS p_success,
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
                         OPTIONAL MATCH (d)-[:HAS_LIVER]->(lv:LiverProfile)
                         RETURN p.pair_id AS pair_id, coalesce(p.organ, 'kidney') AS organ, h.city AS city, h.code AS code,
                                d.abo AS donor_abo, d.relation AS donor_relation, d.untyped_loci AS untyped, t.abo AS patient_abo,
                                t.cpra AS cpra, t.meld AS meld, t.weight_kg AS patient_weight_kg, p.failed_count AS failed_count,
                                CASE WHEN lv IS NULL THEN null ELSE properties(lv) END AS liver ORDER BY r.pos""", {"l": loop_id})
        for f in fams:
            f["own_clash"] = organs.get(f["organ"]).own_clash(f)
        meta = db.raw("""MATCH (l:Loop {loop_id: $l}) OPTIONAL MATCH (l)-[:REPLACED_BY]->(n:Loop)
                         OPTIONAL MATCH (o:Loop)-[:REPLACED_BY]->(l)
                         OPTIONAL MATCH (fb:Loop)-[:FALLBACK_FOR]->(l)
                         RETURN l AS l, n.loop_id AS replaced_by, o.loop_id AS replaces, fb.loop_id AS fallback""", {"l": loop_id})[0]
        workflow = _workflow(loop_id, links)
        readiness = core.CommitteeClerk().readiness(loop_id)
        ev = programs.evidence(loop_id)
        props = meta["l"].properties
        checklist = programs.checklist(loop_id, props.get("organ") or organs.DEFAULT, readiness, ev)
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
    return {"loop": props, "replaced_by": meta["replaced_by"], "replaces": meta["replaces"],
            "fallback": meta["fallback"], "families": fams, "links": links, "workflow": workflow,
            "committee": readiness, "decisions": trail, "proposal": proposal,
            "evidence": ev, "checklist": checklist, "timeline": programs.timeline(props),
            "exchange_label": programs.program(props.get("organ") or organs.DEFAULT)["exchange_label"], "queries": tr.ran}


def _workflow(loop_id: str, links: list[dict]) -> list[dict]:
    offers = {r["p"]: r["resp"] for r in db.raw(
        "MATCH (o:Offer)-[:FOR]->(:Loop {loop_id: $l}) MATCH (o)-[:TO]->(p:Pair) RETURN p.pair_id AS p, o.response AS resp",
        {"l": loop_id})}
    tests = {(r["a"], r["b"]): r for r in db.raw(
        """MATCH (x:Crossmatch)-[:IN]->(:Loop {loop_id: $l}) MATCH (x)-[:DONOR_OF]->(a:Pair), (x)-[:PATIENT_OF]->(b:Pair)
           RETURN a.pair_id AS a, b.pair_id AS b, x.result AS result, x.antibody AS antibody, x.test_id AS test_id, x.due_at AS due,
                  coalesce(x.kind, 'crossmatch') AS kind""",
        {"l": loop_id})}
    out = []
    for l in links:
        a, b = l["from_pair"], l["to_pair"]
        accepted = [offers.get(a), offers.get(b)]
        t = tests.get((a, b))
        out.append({"link": f"{l['from_city']} → {l['to_city']}", "from_pair": a, "to_pair": b,
                    "offered": bool(offers), "accepts": sum(1 for x in accepted if x == "accept"),
                    "holds": sum(1 for x in accepted if x == "hold"),
                    "test": t and ("done" if t["result"] != "pending" else "requested"), "test_kind": t and t["kind"],
                    "result": t and t["result"], "antibody": t and t["antibody"], "due": t and t["due"]})
    return out


@app.get("/api/committee")
def committee(organ: str | None = None):
    """Committee readiness for every loop that is past matching, most urgent first, with each loop's own
    program checklist (data/params `program.committee_review`)."""
    organ = _organ(organ)
    with db.track() as tr:
        rows = [l for l in _loops() if l["status"] in ("testing", "committee", "locked", "offered")
                and (organ is None or l["organ"] == organ)]
        out = []
        for l in rows:
            r = core.CommitteeClerk().readiness(l["loop_id"])
            days_left = min((p["days_left"] for p in r["pairs"]), default=None)
            out.append({**l, "committee": r, "days_left": days_left, "checklist": programs.checklist(l["loop_id"], l["organ"], r),
                        "ready": all(not p["missing"] for p in r["pairs"])})
    out.sort(key=lambda x: (x["ready"], x["days_left"] if x["days_left"] is not None else 999))
    return {"loops": out, "queries": tr.ran}


@app.post("/api/loops/{loop_id}/lab")
def run_lab(loop_id: str, v: Viewer = Depends(access.viewer)):
    v.require("can_run_tests")
    organ, hs = _loop_scope(loop_id)
    v.require_scope(hs, organ)
    with core.LOCK, db.track() as tr:
        try:
            res = core.CrossmatchCoordinator().run_lab(loop_id)
        except core.LoopClosed as e:
            raise HTTPException(409, str(e))
    return {"results": res, "queries": tr.ran}


@app.post("/api/loops/{loop_id}/chase")
def chase(loop_id: str):
    with core.LOCK:
        step = core.CommitteeClerk().chase(loop_id)
    return {"ok": True, "step": step}


class Approve(BaseModel):
    choice: str = "recommended"


def _task_scope(v: Viewer, task_id: str) -> None:
    """Approving or declining a repair is a human decision: it needs the role and every hospital in scope."""
    v.require("can_approve")
    r = db.raw("MATCH (t:Task {task_id: $t}) OPTIONAL MATCH (t)-[:ABOUT]->(l:Loop) RETURN t.status AS s, l.loop_id AS l",
               {"t": task_id})
    if not r:
        raise HTTPException(404, f"no task {task_id} in the graph")
    if r[0]["s"] != "open":
        raise HTTPException(409, f"task {task_id} is already {r[0]['s']}")
    if r[0]["l"]:
        organ, hs = _loop_scope(r[0]["l"])
        v.require_scope(hs, organ)


@app.post("/api/tasks/{task_id}/approve")
def approve(task_id: str, body: Approve, v: Viewer = Depends(access.viewer)):
    _task_scope(v, task_id)
    with core.LOCK:
        r = core.MatchingAgent().approve(task_id, body.choice)
    if "error" in r:
        raise HTTPException(400, r["error"])
    return r


class Decline(BaseModel):
    reason: str


@app.post("/api/tasks/{task_id}/decline")
def decline(task_id: str, body: Decline, v: Viewer = Depends(access.viewer)):
    _task_scope(v, task_id)
    if not body.reason.strip():
        raise HTTPException(400, "a reason is required")
    with core.LOCK:
        r = core.MatchingAgent().decline(task_id, body.reason.strip())
    if "error" in r:
        raise HTTPException(400, r["error"])
    return r


class AskBody(BaseModel):
    question: str
    history: list[dict] = []


@app.get("/api/ask/status")
def ask_status():
    """Which model answers (Claude, or a local model through Ollama) and whether it is reachable right now."""
    return {**ask_agent.status(), "tools": [t["name"] for t in ask_agent.TOOLS]}


@app.get("/api/ask/history")
def ask_history(v: Viewer = Depends(access.viewer)):
    """Answered questions remembered in the graph (Question nodes) that this viewer may see."""
    with db.track() as tr:
        rows = ask_agent.recent(v)
    return {"questions": rows, "queries": tr.ran}


@app.post("/api/ask")
def ask(body: AskBody, v: Viewer = Depends(access.viewer)):
    """Ask KindRed: a model (Claude or a local one) answers from the graph through a fixed set of read-only tools."""
    q = body.question.strip()
    if not q:
        raise HTTPException(400, "a question is required")
    if len(q) > 2000:
        raise HTTPException(400, "keep the question under 2000 characters")
    st = ask_agent.status()
    if not st["enabled"]:
        raise HTTPException(503, f"Ask KindRed's model ({st['model']}) isn't available: {st['how']}")
    try:
        return ask_agent.ask(q, v, body.history)
    except httpx.TimeoutException:
        raise HTTPException(504, "the local model took too long to answer; try a narrower question")
    except httpx.HTTPError as e:
        raise HTTPException(503, f"couldn't reach the local model through Ollama: {e}")
    except anthropic.AuthenticationError:
        raise HTTPException(503, "the Anthropic API key was rejected; check ANTHROPIC_API_KEY in .env")
    except anthropic.RateLimitError:
        raise HTTPException(429, "the model is rate limited right now; try again in a minute")
    except anthropic.APIConnectionError:
        raise HTTPException(503, "couldn't reach the Anthropic API")
    except anthropic.APIStatusError as e:
        raise HTTPException(502, f"model error {e.status_code}: {e.message}")


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
    if code not in {h["code"] for h in config.hospitals()["hospitals"]}:
        raise HTTPException(404, f"no hospital {code} in the exchange")
    g = config.hospital_graph(code)
    pairs = db.raw("MATCH (p:Pair)-[:PATIENT]->(r:Person) OPTIONAL MATCH (p)-[:NEEDS_DOC]->(d:Document {status: 'missing'}) "
                   "RETURN p.pair_id AS pair_id, coalesce(p.organ, 'kidney') AS organ, r.name AS patient, p.published AS published, "
                   "count(d) AS missing_docs "
                   "ORDER BY pair_id", graph=g)
    ids = [p["pair_id"] for p in pairs]
    with db.track() as tr:
        rows = db.run("Q04_two_way_loops", {"ids": ids, "organ": None}) + db.run("Q05_three_way_loops", {"ids": ids, "organ": None})
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

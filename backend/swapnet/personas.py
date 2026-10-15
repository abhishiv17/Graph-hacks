"""Demo patients (docs/personas.md): two synthetic people the agents follow over months, so a visitor sees memory and
hand-offs without signing up. data/params/personas.yaml holds who they are, their readings and the playbooks.

Where each part lives, all in FalkorDB:
- the hospital's private graph (hosp_hyd, hosp_cok): LabResult and Appointment nodes on the hospital's Pair;
- the shared exchange graph: the pair itself (matched like any other), Task hand-offs, Decisions and Events;
- one memory graph per persona (mem_sunita, mem_rajesh): Person, Session, Finding, Fact, Playbook/Step, Handoff.

The persona clock is simulated: week 0 is when the demo was loaded, and "Next week" moves it on seven days.
"""
import time
import uuid
from functools import lru_cache

from swapnet import config
from swapnet.gen.generator import Generator, Pair
from swapnet.gen.liver import private_notes
from swapnet.graph import db

DAY_MS = 86_400_000
WEEK_MS = 7 * DAY_MS


@lru_cache
def settings() -> dict:
    return config.param_file("personas.yaml")


def ids() -> list[str]:
    return list(settings()["personas"])


def get(pid: str) -> dict | None:
    p = settings()["personas"].get(pid)
    return {**p, "id": pid} if p else None


def by_pair(pair_id: str) -> dict | None:
    return next((get(k) for k, v in settings()["personas"].items() if v["pair_id"] == pair_id), None)


def memory_graph(pid: str) -> str:
    return f"mem_{pid}"


def hospital_graph(p: dict) -> str:
    return config.hospital_graph(p["hospital"])


def _id(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:6]}"


def stage_label(organ: str, key: str | None) -> str:
    return next((s["label"] for s in settings()["stages"][organ] if s["key"] == key), key or "unknown")


def stage_rank(organ: str, key: str | None) -> int:
    keys = [s["key"] for s in settings()["stages"][organ]]
    return keys.index(key) if key in keys else -1


# ---------------------------------------------------------------- clock

def clock(pid: str) -> dict:
    """The persona's simulated date: the base time plus seven days per week advanced."""
    r = db.raw("MATCH (me:Person {persona_id: $p}) RETURN me.base AS base, me.week AS week", {"p": pid}, graph=memory_graph(pid))
    if not r:
        return {"base": int(time.time() * 1000), "week": 0, "now": int(time.time() * 1000)}
    base, week = r[0]["base"], r[0]["week"] or 0
    return {"base": base, "week": week, "now": base + week * WEEK_MS}


# ---------------------------------------------------------------- the rule the health watch applies

def slope_per_year(points: list[tuple[int, float]]) -> float:
    """Least-squares slope of the last four readings, in units per year (negative = falling)."""
    pts = points[-4:]
    if len(pts) < 2:
        return 0.0
    xs = [t / (365 * DAY_MS) for t, _ in pts]
    ys = [v for _, v in pts]
    mx, my = sum(xs) / len(xs), sum(ys) / len(ys)
    den = sum((x - mx) ** 2 for x in xs)
    return 0.0 if den == 0 else sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / den


def assess(organ: str, points: list[tuple[int, float]]) -> dict:
    """Stage, trend and projection from readings. Compares numbers with configured thresholds; never a diagnosis."""
    th = settings()["thresholds"][organ]
    v = points[-1][1]
    slope = slope_per_year(points)
    if organ == "kidney":
        decline = -slope
        weeks = round((v - th["failure_egfr"]) / decline * 52, 1) if decline > 0 and v > th["failure_egfr"] else None
        if v < th["failure_egfr"] or (weeks is not None and weeks <= th["act_within_weeks"]):
            stage = "act"
        elif v <= th["preemptive_egfr"]:
            stage = "prepare"
        elif decline > th["rapid_decline_per_year"]:
            stage = "watch"
        else:
            stage = "stable"
        next_label = f"eGFR {th['failure_egfr']}" if v >= th["failure_egfr"] else None
    else:
        nxt = next((x for x in (th["benefit_meld"], th["prepare_meld"], th["urgent_meld"]) if x > v), None)
        weeks = round((nxt - v) / slope * 52, 1) if nxt and slope > 0 else None
        stage = ("act" if v >= th["urgent_meld"] else "prepare" if v >= th["prepare_meld"]
                 else "watch" if v >= th["benefit_meld"] else "stable")
        next_label = f"MELD {nxt}" if nxt else None
    return {"stage": stage, "value": v, "slope_per_year": round(slope, 1), "weeks_to_next": weeks, "next_label": next_label}


def trend_text(organ: str, a: dict, projection: bool = True) -> str:
    s = a["slope_per_year"]
    if organ == "kidney":
        trend = f"falling about {abs(s):.0f} a year" if s < -0.5 else f"rising about {s:.0f} a year" if s > 0.5 else "steady"
        label = "eGFR"
    else:
        m = s / 12  # MELD moves in points per month
        trend = f"rising about {m:.1f} points a month" if m > 0.2 else f"falling about {abs(m):.1f} points a month" if m < -0.2 else "steady"
        label = "MELD"
    proj = (f"; about {a['weeks_to_next']:.0f} weeks to {a['next_label']} at this rate"
            if projection and a.get("weeks_to_next") is not None else "")
    return f"{label} {a['value']:g}, {trend}{proj}"


# ---------------------------------------------------------------- seeding

def arrival_pair(spec: dict) -> Pair:
    """A family that joins the pool during a journey (personas.yaml `arrivals`), built like a persona's own pair."""
    return _pair({"approval_age_days": 5, "missing_documents": [], **spec})


def _pair(p: dict) -> Pair:
    from swapnet.scenario import _ab, _ag  # scenario loads personas, so import its helpers late
    docs = {d: ("missing" if d in p.get("missing_documents", []) else "verified")
            for d in (["ct_volumetry_report", "blood_group_card", "relationship_proof", "id_proof", "consent"]
                      if p["organ"] == "liver" else ["hla_report", "blood_group_card", "relationship_proof", "id_proof", "consent"])}
    phone = f"ph-{p['hospital'].lower()}-{p['pair_id'][-4:]}"
    if p["organ"] == "kidney":
        abs_ = _ab(p["antibodies"])
        pr = Pair(p["pair_id"], p["hospital"], dict(p["donor"]), {**p["patient"], "cpra": Generator(0).cpra(abs_)},
                  _ag(p["antigens"]), abs_, docs, p["approval_age_days"], phone)
    else:
        lv = p["liver"]
        d_ev = {"anatomy_review": lv["anatomy_review"], "donor_evaluation": lv["donor_evaluation"]}
        ct = {k: lv[k] for k in ("liver_volume_ml", "left_lobe_ml", "right_lobe_ml", "right_lobe_ok", "steatosis")}
        pr = Pair(p["pair_id"], p["hospital"], dict(p["donor"]), {**p["patient"], "cpra": 0}, [], [], docs,
                  p["approval_age_days"], phone, organ="liver", liver=dict(lv), liver_ct=ct, private=private_notes(d_ev))
    return pr


def seed(pid: str, publish_pair: bool = True) -> dict:
    """Put one persona in the graph: the pair (published like any family), six months of readings and visits in the
    hospital graph, and a memory graph with the playbooks, a baseline finding, current facts and one earlier session."""
    from swapnet.agents import core
    p = get(pid)
    if publish_pair:
        res = core.IntakeAgent(p["hospital"]).add_pair(_pair(p))
        db.raw("MATCH (pp:Person {pair_id: $id, role: 'patient'}) SET pp.name = $n", {"id": p["pair_id"], "n": p["name"]},
               graph=hospital_graph(p))
    else:
        res = {"published": True, "reused": True}
    now = int(time.time() * 1000)
    hg, mg, m = hospital_graph(p), memory_graph(pid), p["measure"]
    db.raw("MATCH (:Pair {pair_id: $id})-[:HAS_RESULT|HAS_APPOINTMENT]->(x) DELETE x", {"id": p["pair_id"]}, graph=hg)
    readings = [{"result_id": f"R-{pid[:3]}-{i:02d}", "value": float(v), "at": now - d * DAY_MS, "week": -round(d / 7)}
                for i, (d, v) in enumerate(p["history"])]
    db.raw("""MATCH (pp:Pair {pair_id: $id}) UNWIND $rs AS r
              CREATE (pp)-[:HAS_RESULT]->(:LabResult {result_id: r.result_id, kind: $kind, value: r.value, unit: $unit,
                                                      at: r.at, week: r.week, source: 'hospital lab (synthetic)', assessed: true})""",
           {"id": p["pair_id"], "rs": readings, "kind": m["key"], "unit": m["unit"]}, graph=hg)
    visits = [{"appointment_id": f"A-{pid[:3]}-{i:02d}", "kind": v["kind"], "at": now - v["days_ago"] * DAY_MS, "note": v["note"]}
              for i, v in enumerate(p.get("past_visits", []))]
    db.raw("""MATCH (pp:Pair {pair_id: $id}) UNWIND $vs AS v
              CREATE (pp)-[:HAS_APPOINTMENT]->(:Appointment {appointment_id: v.appointment_id, kind: v.kind, status: 'done',
                                                             at: v.at, note: v.note, booked_by: 'hospital'})""",
           {"id": p["pair_id"], "vs": visits}, graph=hg)

    # The persona's own memory graph, rebuilt from scratch.
    if mg in db.db().list_graphs():
        db.db().select_graph(mg).delete()
    db.raw("CREATE (:Person {persona_id: $p, pair_id: $pair, name: $n, organ: $o, hospital: $h, base: $now, week: 0})",
           {"p": pid, "pair": p["pair_id"], "n": p["name"], "o": p["organ"], "h": p["hospital"], "now": now}, graph=mg)
    for stage, steps in settings()["playbooks"][p["organ"]].items():
        db.raw("""MATCH (me:Person {persona_id: $p}) CREATE (me)-[:FOLLOWS]->(pb:Playbook {stage: $stage, label: $label})
                  WITH pb UNWIND range(0, size($steps) - 1) AS i
                  WITH pb, i, $steps[i] AS s
                  CREATE (pb)-[:STEP {order: i + 1}]->(:Step {agent: s.agent, action: s.action, what: s.what, in_days: s.in_days, why: s.why})""",
               {"p": pid, "stage": stage, "label": stage_label(p["organ"], stage),
                "steps": [{"what": None, "in_days": None, **s} for s in steps]}, graph=mg)
    pts = [(r["at"], r["value"]) for r in readings]
    a = assess(p["organ"], pts)
    last = readings[-1]
    remember_finding(pid, kind="baseline", stage=a["stage"], previous=None, a=a, at=last["at"], week=0,
                     text=f"On file when the demo began: {trend_text(p['organ'], a)}. Stage: {stage_label(p['organ'], a['stage'])}.",
                     readings=readings[-4:], triggered=None)
    update_facts(pid, a, last["at"])
    db.raw("""MATCH (me:Person {persona_id: $p})
              CREATE (me)-[:HAD_SESSION]->(:Session {session_id: $s, at: $at, created: $at, week: 0,
                                                     greeting: 'First look at this case after the referral.'})""",
           {"p": pid, "s": _id("S"), "at": now - 14 * DAY_MS}, graph=mg)
    return {"persona": pid, **res, "stage": a["stage"]}


def seed_all(publish_pair: bool = True) -> list[dict]:
    return [seed(pid, publish_pair) for pid in ids()]


def reset(pid: str) -> dict:
    """Replay a journey from the seeded six months: undo the swap the agents formed (its other families go back to
    waiting), remove families that arrived during the journey, and clear hand-offs, appointments and memory."""
    p = get(pid)
    arrivals = list((p.get("arrivals") or {}).values())
    ids = [p["pair_id"], *[a["pair_id"] for a in arrivals]]
    loops = [r["l"] for r in db.raw("MATCH (q:Pair)-[:IN_LOOP]->(l:Loop) WHERE q.pair_id IN $ids RETURN DISTINCT l.loop_id AS l",
                                    {"ids": ids})]
    if loops:
        db.raw("MATCH (q:Pair)-[:IN_LOOP]->(l:Loop) WHERE l.loop_id IN $ls SET q.status = 'waiting', q.docs_requested = null",
               {"ls": loops})
        db.raw("MATCH (x)-[:FOR|IN|ABOUT]->(l:Loop) WHERE l.loop_id IN $ls DETACH DELETE x", {"ls": loops})
        db.raw("MATCH (l:Loop) WHERE l.loop_id IN $ls DETACH DELETE l", {"ls": loops})
    for a in arrivals:
        db.raw("MATCH (q:Pair {pair_id: $id}) OPTIONAL MATCH (q)-[:HAS_DONOR|HAS_PATIENT]->(x) OPTIONAL MATCH (x)-[:HAS_LIVER]->(lv) "
               "DETACH DELETE q, x, lv", {"id": a["pair_id"]})
        db.raw("MATCH (q:Pair {pair_id: $id}) OPTIONAL MATCH (q)-[*1..2]->(x) DETACH DELETE q, x", {"id": a["pair_id"]},
               graph=config.hospital_graph(a["hospital"]))
    db.raw("MATCH (t:Task {kind: 'handoff'})-[:ABOUT]->(:Pair {pair_id: $id}) DETACH DELETE t", {"id": p["pair_id"]})
    db.raw("""MATCH (pp:Pair {pair_id: $id})-[:HAS_PATIENT]->(t:Patient)
              SET pp.urgent = false, pp.needs_rematch = false, pp.searched_pool = null, pp.status = 'waiting',
                  pp.docs_requested = null, pp.approval_state = 'submitted', t.meld = $meld""",
           {"id": p["pair_id"], "meld": p["patient"].get("meld")})
    db.raw("MATCH (:Pair {pair_id: $id})-[:NEEDS_DOC]->(d:Document) "
           "SET d.status = CASE WHEN d.type IN $m THEN 'missing' ELSE 'verified' END",
           {"id": p["pair_id"], "m": p.get("missing_documents", [])}, graph=hospital_graph(p))
    db.event("Health watch", f"{p['name']}'s demo journey (P-{p['pair_id'][-4:]}) restarted from the six months on file.", "info")
    return seed(pid, publish_pair=False)


# ---------------------------------------------------------------- memory writes

def remember_finding(pid: str, *, kind: str, stage: str, previous: str | None, a: dict, at: int, week: int, text: str,
                     readings: list[dict], triggered: str | None) -> str:
    fid = _id("F")
    db.run("Q45_remember_finding", {
        "persona_id": pid, "finding_id": fid, "at": at, "week": week, "kind": kind, "stage": stage, "previous_stage": previous,
        "text": text, "value": a["value"], "slope_per_year": a["slope_per_year"], "weeks_to_next": a["weeks_to_next"],
        "readings": [{"result_id": r["result_id"], "value": r["value"], "at": r["at"]} for r in readings],
        "triggered": triggered or "",
    }, graph=memory_graph(pid))
    db.raw("MATCH (f:Finding {finding_id: $f}) SET f.created = timestamp()", {"f": fid}, graph=memory_graph(pid))
    return fid


def update_fact(pid: str, key: str, value, text: str, at: int) -> None:
    db.run("Q46_update_fact", {"persona_id": pid, "fact_id": _id("K"), "key": key, "value": str(value), "text": text, "at": at},
           graph=memory_graph(pid))


def update_facts(pid: str, a: dict, at: int) -> None:
    p = get(pid)
    update_fact(pid, "stage", a["stage"], f"Stage: {stage_label(p['organ'], a['stage'])}", at)
    update_fact(pid, "trend", a["slope_per_year"], trend_text(p["organ"], a, projection=False), at)
    if a.get("weeks_to_next") is not None:
        update_fact(pid, "projection", a["weeks_to_next"], f"About {a['weeks_to_next']:.0f} weeks to {a['next_label']} at this rate", at)
    elif a.get("next_label") is None:
        last = "eGFR below 15" if p["organ"] == "kidney" else "MELD 25 or more"
        update_fact(pid, "projection", "past", f"Past the last threshold ({last})", at)
    else:
        update_fact(pid, "projection", "none", f"Not heading towards {a['next_label']} at this rate", at)


def handoff_mirror(pid: str, finding_id: str, task_id: str, agent: str, action: str, status: str, detail: str | None) -> None:
    """Keep the agents' own record of a hand-off in the persona's memory, linked to the finding that started it."""
    db.raw("""MATCH (f:Finding {finding_id: $f})
              MERGE (h:Handoff {task_id: $t}) SET h.agent = $agent, h.action = $action, h.status = $status, h.detail = $detail
              MERGE (f)-[:HANDED_OFF]->(h)""",
           {"f": finding_id, "t": task_id, "agent": agent, "action": action, "status": status, "detail": detail},
           graph=memory_graph(pid))


# ---------------------------------------------------------------- reads

def readings(pid: str) -> list[dict]:
    p = get(pid)
    return db.run("Q40_persona_readings", {"pair_id": p["pair_id"], "kind": p["measure"]["key"]}, graph=hospital_graph(p))


def summary(pid: str) -> dict:
    p = get(pid)
    rs = readings(pid)
    facts = {f["key"]: f for f in db.run("Q42_current_facts", {"persona_id": pid}, graph=memory_graph(pid))}
    stage = facts.get("stage", {}).get("value")
    from swapnet.agents import health  # health imports this module
    cs = health.case(p["pair_id"])
    st = db.raw("MATCH (pp:Pair {pair_id: $id}) RETURN pp.status AS s", {"id": p["pair_id"]})
    c = clock(pid)
    return {"id": pid, "name": p["name"], "age": p["age"], "organ": p["organ"], "pair_id": p["pair_id"], "hospital": p["hospital"],
            "city": next(h["city"] for h in config.hospitals()["hospitals"] if h["code"] == p["hospital"]),
            "story": p["story"], "measure": p["measure"], "stage": stage, "stage_label": stage_label(p["organ"], stage),
            "last": rs[-1] if rs else None, "trend": facts.get("trend", {}).get("text"), "week": c["week"], "now": c["now"],
            "weeks_left": len(p["future"]) - c["week"], "case": cs, "pair_status": st[0]["s"] if st else None,
            "transplanted": bool(st and st[0]["s"] == "transplanted")}


def journey(pid: str) -> dict:
    """Everything the persona screen shows, each part read from the graph that holds it."""
    p = get(pid)
    mg, hg = memory_graph(pid), hospital_graph(p)
    with db.track() as tr:
        s = summary(pid)
        rs = readings(pid)
        facts = db.run("Q42_current_facts", {"persona_id": pid}, graph=mg)
        findings = db.run("Q43_findings", {"persona_id": pid, "limit": 30}, graph=mg)
        stage = s["stage"] or "stable"
        playbook = db.run("Q44_playbook", {"persona_id": pid, "stage": stage}, graph=mg)
        sessions = db.run("Q47_sessions", {"persona_id": pid, "limit": 10}, graph=mg)
        handoffs = db.run("Q48_pair_handoffs", {"pair_id": p["pair_id"]})
        appts = db.run("Q49_appointments", {"pair_id": p["pair_id"]}, graph=hg)
        pair = db.raw("""MATCH (pp:Pair {pair_id: $id}) OPTIONAL MATCH (pp)-[:IN_LOOP]->(l:Loop)
                         WHERE l.status IN ['selected', 'offered', 'testing', 'committee', 'locked']
                         RETURN pp.status AS status, coalesce(pp.urgent, false) AS urgent, coalesce(pp.needs_rematch, false) AS needs_rematch,
                                pp.approval_state AS approval_state, l.loop_id AS loop_id""", {"id": p["pair_id"]})
    for f in findings:
        f["readings"] = [r for r in f["readings"] if r.get("result_id")]
        f["handoffs"] = [h for h in f["handoffs"] if h.get("task_id")]
    import json
    for h in handoffs:
        h["payload"] = json.loads(h["payload"]) if h.get("payload") else {}
    liaison = next((h for h in handoffs if h["action"] == "message" and h["status"] == "done"), None)
    th = settings()["thresholds"][p["organ"]]
    bands = ([{"value": th["preemptive_egfr"], "label": "Pre-emptive window · 20"},
              {"value": th["failure_egfr"], "label": "Kidney failure · below 15"}] if p["organ"] == "kidney" else
             [{"value": th["benefit_meld"], "label": "Transplant benefit · 15"},
              {"value": th["prepare_meld"], "label": "Labs every 30 days · 19"},
              {"value": th["urgent_meld"], "label": "Urgent · 25"}])
    return {**s, "readings": rs, "facts": facts, "findings": findings, "playbook": playbook, "sessions": sessions,
            "handoffs": handoffs, "appointments": appts, "pair": pair[0] if pair else None,
            "family_message": liaison and liaison["result"], "thresholds": bands,
            "stages": settings()["stages"][p["organ"]], "sources": settings()["thresholds"]["sources"],
            "graphs": {"memory": mg, "hospital": hg, "shared": config.EXCHANGE}, "queries": tr.ran}


# ---------------------------------------------------------------- sessions (memory across visits)

def start_session(pid: str) -> dict:
    """A visit to the persona's page. The greeting says what the agents learned since the previous visit, from memory."""
    p, mg = get(pid), memory_graph(pid)
    with db.track() as tr:
        last = db.run("Q47_sessions", {"persona_id": pid, "limit": 1}, graph=mg)
        prev = last[0] if last else None
        created = db.raw("MATCH (:Person {persona_id: $p})-[:HAD_SESSION]->(s:Session) RETURN max(s.created) AS c", {"p": pid}, graph=mg)
        prev_created = created[0]["c"] if created else None
        now_real = int(time.time() * 1000)
        new = db.raw("""MATCH (:Person {persona_id: $p})-[:HAS_FINDING]->(f:Finding) WHERE f.created > $since
                        AND f.kind IN ['reading', 'stage_change', 'case']
                        RETURN f.kind AS kind, f.stage AS stage, f.previous_stage AS prev, f.at AS at, f.text AS text ORDER BY f.at""",
                     {"p": pid, "since": prev_created or 0}, graph=mg)
        # A reload within a minute with nothing new is the same visit, not a new session.
        if prev_created and now_real - prev_created < 60_000 and not new:
            return {"greeting": prev["greeting"], "session_id": prev["session_id"], "reused": True, "queries": tr.ran}
        c = clock(pid)
        when = time.strftime("%d %b", time.localtime((prev["at"] if prev else c["now"]) / 1000))
        changes = [f for f in new if f["kind"] == "stage_change"]
        readings_n = sum(1 for f in new if f["kind"] in ("stage_change", "reading"))
        if not new:
            rs = readings(pid)
            g = (f"Welcome back. Nothing new since your last look on {when}. Latest {p['measure']['label']}: "
                 f"{rs[-1]['value']:g}." if rs else "Welcome back.")
        else:
            parts = [f"{readings_n} new reading{'s' if readings_n != 1 else ''}"] if readings_n else []
            for f in changes:
                parts.append(f"stage moved from {stage_label(p['organ'], f['prev'])} to {stage_label(p['organ'], f['stage'])} "
                             f"on {time.strftime('%d %b', time.localtime(f['at'] / 1000))}")
            moves = [f for f in new if f["kind"] == "case"]
            if moves:  # the latest step of the case, without the agent's name in front
                parts.append("latest: " + moves[-1]["text"].split(". ")[0].split(": ", 1)[-1])
            g = f"Welcome back. Since your last look on {when}: " + "; ".join(parts) + "."
        sid = _id("S")
        db.raw("""MATCH (me:Person {persona_id: $p})
                  CREATE (me)-[:HAD_SESSION]->(:Session {session_id: $s, at: $at, created: timestamp(), week: $w, greeting: $g})""",
               {"p": pid, "s": sid, "at": c["now"], "w": c["week"], "g": g}, graph=mg)
    return {"greeting": g, "session_id": sid, "reused": False, "queries": tr.ran}

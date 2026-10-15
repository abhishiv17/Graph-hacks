"""The demo patients' week (docs/personas.md): the world, the health watch, and the coordinator agent.

Each simulated week (`advance`):
1. The world moves (not an agent, and labelled as such): scripted new families join the pool, hospitals send papers
   the clerk asked for a week ago, and a booked surgery happens on its date.
2. The hospital lab sends a new reading. The health watch compares the trend with configured thresholds and with the
   stage it remembers (the persona's memory graph). Only a more urgent stage triggers the stage's playbook, which it
   reads from the graph, handing one Task per step to the scheduler, committee clerk or patient liaison. Each agent
   picks up its own open tasks (`run_handoffs`, also called by the background watch every sweep).
3. The coordinator agent (agents/coordinator.py, a language model with a fixed tool catalogue) chooses this week's
   step for the case: search shallow then deep, form the swap, run the tests, ask for papers, or book the surgery.
No step waits for a button. People see every step, and Replay restarts the journey.
"""
import json
import time

from swapnet import config, personas
from swapnet.agents import core, recall
from swapnet.graph import db, publish

DAY_MS = personas.DAY_MS
HEALTH = "Health watch"
SCHEDULER = "Scheduler"
LIVE = ["selected", "offered", "testing", "committee", "locked"]


def ensure_agents() -> None:
    db.raw("UNWIND $a AS a MERGE (g:Agent {name: a[0]}) SET g.kind = a[1]",
           {"a": [[HEALTH, "health"], [SCHEDULER, "scheduler"], ["Coordinator agent", "coordinator"]]})


def _city(code: str) -> str:
    return next(h["city"] for h in config.hospitals()["hospitals"] if h["code"] == code)


def _date(ms: int) -> str:
    return time.strftime("%d %b", time.localtime(ms / 1000))


class EndOfJourney(ValueError):
    """The journey is over (transplant done, or the scripted readings ran out); replay it to start again."""


def case(pair_id: str) -> dict | None:
    """The live swap this pair is in, if any, with its route and where it stands."""
    r = db.raw("""MATCH (p:Pair {pair_id: $id})-[:IN_LOOP]->(l:Loop) WHERE l.status IN $live AND NOT l.loop_id ENDS WITH '-FB'
                  MATCH (q:Pair)-[r:IN_LOOP]->(l) MATCH (q)-[:REGISTERED_AT]->(h:Hospital)
                  WITH p, l, q, h ORDER BY r.pos
                  RETURN l.loop_id AS loop_id, l.status AS status, l.kind AS kind, l.surgery_at AS surgery_at,
                         l.transplanted_at AS transplanted_at, l.p_success AS p_success, l.created_at AS created_at,
                         p.status AS pair_status, collect(q.pair_id) AS pairs, collect(h.city) AS cities, collect(h.code) AS codes
                  ORDER BY created_at DESC LIMIT 1""", {"id": pair_id, "live": LIVE})
    if not r:
        return None
    c = r[0]
    c["route"] = (" ⇄ " if len(c["cities"]) == 2 else " → ").join(c["cities"])
    return c


def _note(p: dict, text: str, now: int, week: int, kind: str = "world") -> None:
    """Remembered in the persona's memory graph next to the agents' findings."""
    rs = personas.readings(p["id"])
    a = personas.assess(p["organ"], [(r["at"], r["value"]) for r in rs])
    personas.remember_finding(p["id"], kind=kind, stage=a["stage"], previous=a["stage"], a=a, at=now, week=week,
                              text=text, readings=[], triggered=None)


def _transplanted(p: dict) -> bool:
    return db.raw("MATCH (pp:Pair {pair_id: $id}) RETURN pp.status AS s", {"id": p["pair_id"]})[0]["s"] == "transplanted"


# ---------------------------------------------------------------- 1. the world

def world(p: dict, now: int, week: int) -> list[str]:
    """What happens outside the agents this week. Synthetic, and shown as such."""
    out = []
    spec = (p.get("arrivals") or {}).get(week)
    if spec:
        core.IntakeAgent(spec["hospital"]).add_pair(personas.arrival_pair(spec))
        out.append(f"A new {spec['organ']} family ({spec['pair_id']}) joined the pool in {_city(spec['hospital'])}")
    c = case(p["pair_id"])
    ids = list({p["pair_id"], *(c["pairs"] if c else [])})
    # Papers requested at least a week ago arrive.
    for r in db.raw("""MATCH (q:Pair)-[:REGISTERED_AT]->(h:Hospital) WHERE q.pair_id IN $ids AND q.docs_requested_at <= $due
                       RETURN q.pair_id AS q, h.code AS code""", {"ids": ids, "due": now - 7 * DAY_MS}):
        got = [d["type"] for d in publish.documents(r["q"], r["code"]) if d["status"] != "verified"]
        if got:
            db.raw("MATCH (:Pair {pair_id: $id})-[:NEEDS_DOC]->(d:Document) WHERE d.type IN $t SET d.status = 'verified'",
                   {"id": r["q"], "t": got}, graph=config.hospital_graph(r["code"]))
            out.append(f"{_city(r['code'])} sent {r['q']}'s {', '.join(t.replace('_', ' ') for t in got)}")
        db.raw("MATCH (q:Pair {pair_id: $id}) SET q.docs_requested_at = null", {"id": r["q"]})
    if c and c["status"] == "locked" and c["surgery_at"] and c["surgery_at"] <= now and not c["transplanted_at"]:
        db.raw("""MATCH (l:Loop {loop_id: $l}) SET l.transplanted_at = $now
                  WITH l MATCH (q:Pair)-[:IN_LOOP]->(l) SET q.status = 'transplanted'""", {"l": c["loop_id"], "now": now})
        db.raw("MATCH (:Pair {pair_id: $id})-[:HAS_APPOINTMENT]->(a:Appointment {kind: 'Transplant surgery'}) SET a.status = 'done'",
               {"id": p["pair_id"]}, graph=personas.hospital_graph(p))
        personas.update_fact(p["id"], "swap", f"{c['loop_id']}:done", f"Transplanted through swap {c['loop_id']} ({c['route']}) on {_date(now)}", now)
        db.event(SCHEDULER, f"{c['loop_id']} ({c['route']}): transplant surgery done for every family (synthetic).", "ok")
        out.append(f"Transplant done: {c['loop_id']} ({c['route']}), every family on the same day. The journey is complete")
    for s in out:
        db.event("Hospitals (simulated)", f"{p['pair_id']}: {s}. Synthetic.", "info")
        _note(p, s, now, week)
    return out


# ---------------------------------------------------------------- one simulated week

def advance(pid: str) -> dict:
    from swapnet.agents import coordinator
    p = personas.get(pid)
    if _transplanted(p):
        raise EndOfJourney(f"{p['name']}'s transplant is done; replay the journey to start again")
    c = personas.clock(pid)
    week = c["week"] + 1
    if week > len(p["future"]):
        raise EndOfJourney(f"{p['name']}'s scripted journey has no more readings; replay it to start again")
    now = c["base"] + week * personas.WEEK_MS
    db.raw("MATCH (me:Person {persona_id: $p}) SET me.week = $w", {"p": pid, "w": week}, graph=personas.memory_graph(pid))
    events = world(p, now, week)
    finding, decision, handoffs = None, None, []
    if not _transplanted(p):
        finding = _new_reading(p, week, now)
        handoffs = run_handoffs()
        decision = coordinator.run_week(p, now, week)
    return {"week": week, "world": events, "finding": finding, "handoffs_run": handoffs, "decision": decision}


def _new_reading(p: dict, week: int, at: int) -> dict | None:
    m = p["measure"]
    value = float(p["future"][week - 1])
    rid = f"R-{p['id'][:3]}-w{week:02d}"
    db.run("Q41_record_reading", {"pair_id": p["pair_id"], "result_id": rid, "kind": m["key"], "value": value, "unit": m["unit"],
                                  "at": at, "week": week, "source": "hospital lab (synthetic)"}, graph=personas.hospital_graph(p))
    if p["organ"] == "liver":
        # MELD is also a matching fact: the shared exchange keeps the latest score (it sets the urgent priority).
        db.raw("MATCH (:Pair {pair_id: $id})-[:HAS_PATIENT]->(t:Patient) SET t.meld = $v", {"id": p["pair_id"], "v": int(value)})
    db.event(f"Lab · {_city(p['hospital'])}", f"New {m['label']} reading for {p['pair_id']} ({p['name']}): {value:g} {m['unit']} "
                                               f"on {_date(at)}. Synthetic.", "info")
    return HealthWatch().assess(p["id"])


# ---------------------------------------------------------------- 2. health watch

class HealthWatch:
    name = HEALTH

    def assess(self, pid: str) -> dict | None:
        """Assess every unassessed reading for this persona. Returns the last finding written, if any."""
        p = personas.get(pid)
        rows = personas.readings(pid)
        out = None
        for i, r in enumerate(rows):
            if r["assessed"]:
                continue
            out = self._assess_one(p, rows[: i + 1])
            db.raw("MATCH (x:LabResult {result_id: $r}) SET x.assessed = true", {"r": r["result_id"]}, graph=personas.hospital_graph(p))
        return out

    def _assess_one(self, p: dict, rows: list[dict]) -> dict:
        pid, organ = p["id"], p["organ"]
        last = rows[-1]
        a = personas.assess(organ, [(r["at"], r["value"]) for r in rows])
        facts = {f["key"]: f for f in db.run("Q42_current_facts", {"persona_id": pid}, graph=personas.memory_graph(pid))}
        before = facts.get("stage", {}).get("value")
        worse = personas.stage_rank(organ, a["stage"]) > personas.stage_rank(organ, before)
        label = personas.stage_label
        trend = personas.trend_text(organ, a)
        prev = rows[-2] if len(rows) > 1 else None
        since = f" (was {prev['value']:g} on {_date(prev['at'])})" if prev else ""
        rule = next((s["rule"] for s in personas.settings()["stages"][organ] if s["key"] == a["stage"]), "")
        c = case(p["pair_id"])
        acts = worse
        if worse and c and c["status"] == "locked":
            text = (f"{trend}{since}. Stage moved to {label(organ, a['stage'])}, but the transplant is already booked "
                    f"({c['loop_id']}, {_date(c['surgery_at'])}), so there is nothing new to hand out.")
            acts = False
        elif worse:
            text = (f"{trend}{since}. Stage moved from {label(organ, before)} to {label(organ, a['stage'])}: {rule}. "
                    f"Following the {label(organ, a['stage'])} playbook.")
        elif a["stage"] != before:
            text = f"{trend}{since}. Stage eased from {label(organ, before)} to {label(organ, a['stage'])}."
        else:
            text = f"{trend}{since}. Still {label(organ, a['stage'])}; already acted on it, so no repeat alerts."
        kind = "stage_change" if a["stage"] != before else "reading"
        # What it read before deciding: the stage it remembers, the live swap, and (if it acts) the stage's playbook.
        read = [recall.item("remembered stage", "semantic", "Health watch", 1 if before else 0,
                            "the new stage is more urgent, so its playbook runs" if acts else
                            "the transplant is booked, so nothing new is handed out" if worse else
                            "not more urgent than the remembered stage, so no repeat alerts",
                            [f"{facts['stage']['text']} (since {_date(facts['stage']['at'])})"] if before else [])]
        if c:
            read.append(recall.item("live swap", "shared", "Matching agent and Coordinator agent", 1,
                                    "the family's messages mention the swap" if acts else "checked before handing anything out",
                                    [f"{c['loop_id']} ({c['route']}), {c['status']}"]))
        steps = db.run("Q44_playbook", {"persona_id": pid, "stage": a["stage"]}, graph=personas.memory_graph(pid)) if acts else []
        if steps:
            read.append(recall.item(f"{label(organ, a['stage'])} playbook steps", "procedural", "the care team (seeded playbook)",
                                    len(steps), "one task per step, handed to its agent",
                                    [f"{s['agent']}: {s['what'] or s['action']}" for s in steps]))
        fid = personas.remember_finding(pid, kind=kind, stage=a["stage"], previous=before, a=a, at=last["at"], week=last["week"],
                                        text=text, readings=rows[-4:], triggered=a["stage"] if acts else None, read=read)
        personas.update_facts(pid, a, last["at"])
        db.event(self.name, f"{p['pair_id']} ({p['name']}): {text}", "warn" if worse else "info")
        tasks = []
        if acts:
            core.decide(self.name, "stage_change", text, [("Pair", "pair_id", p["pair_id"])], pair_id=p["pair_id"], read=read)
            tasks = self._hand_off(p, fid, a, steps)
        return {"finding_id": fid, "kind": kind, "stage": a["stage"], "previous_stage": before, "text": text, "tasks": tasks}

    def _hand_off(self, p: dict, fid: str, a: dict, steps: list[dict]) -> list[str]:
        """Give each step of the stage's playbook (read from memory) to its agent as a Task in the exchange graph."""
        out = []
        for s in steps:
            tid = core._id("T")
            db.raw("""CREATE (t:Task {task_id: $t, kind: 'handoff', action: $action, status: 'open', created_at: timestamp(),
                                      payload: $payload, finding_id: $f, persona: $pid, step: $step})
                      WITH t MATCH (pp:Pair {pair_id: $pair}), (g:Agent {name: $agent})
                      CREATE (t)-[:ABOUT]->(pp), (t)-[:ASSIGNED_TO]->(g)""",
                   {"t": tid, "action": s["action"], "payload": json.dumps({**s, "stage": a["stage"]}),
                    "f": fid, "pid": p["id"], "step": s["step"], "pair": p["pair_id"], "agent": s["agent"]})
            personas.handoff_mirror(p["id"], fid, tid, s["agent"], s["action"], "open", s.get("what") or s["why"])
            out.append(tid)
        if out:
            db.event(self.name, f"Handed {len(out)} tasks to {', '.join(sorted({s['agent'] for s in steps}))} for {p['pair_id']}.", "plan")
        return out


def run_handoffs() -> list[str]:
    """Every agent does its open hand-offs, in step order."""
    rows = db.raw("""MATCH (t:Task {kind: 'handoff', status: 'open'})-[:ASSIGNED_TO]->(g:Agent)
                     RETURN t.task_id AS tid, t.action AS action, t.payload AS payload, t.finding_id AS f, t.persona AS pid,
                            g.name AS agent, t.created_at AS created, t.step AS step ORDER BY created, step""")
    out = []
    for r in rows:
        p = personas.get(r["pid"])
        if not p:
            continue
        step = json.loads(r["payload"])
        fn = {"book": Scheduler().book, "chase_documents": _chase_documents, "message": _family_message}.get(r["action"])
        result = fn(p, step) if fn else f"No handler for {r['action']}"
        # The agent acts on another agent's memory: the task the health watch wrote from its finding and playbook.
        read = (f"Picked up the Health watch's task: step {step.get('step', r['step'])} of the "
                f"{personas.stage_label(p['organ'], step.get('stage'))} playbook, from finding {r['f']}")
        db.raw("MATCH (t:Task {task_id: $t}) SET t.status = 'done', t.done_at = timestamp(), t.result = $r, t.read = $read",
               {"t": r["tid"], "r": result, "read": read})
        personas.handoff_mirror(p["id"], r["f"], r["tid"], r["agent"], r["action"], "done", result)
        db.event(r["agent"], f"{p['pair_id']}: {result}", "info")
        out.append(f"{r['agent']}: {result}")
    return out


class Scheduler:
    name = SCHEDULER

    def book(self, p: dict, step: dict) -> str:
        """Book an appointment in the hospital graph, unless one of the same kind is already ahead."""
        hg = personas.hospital_graph(p)
        now = personas.clock(p["id"])["now"]
        exists = db.raw("""MATCH (:Pair {pair_id: $id})-[:HAS_APPOINTMENT]->(a:Appointment {kind: $k})
                           WHERE a.at >= $now AND a.status = 'booked' RETURN a.at AS at LIMIT 1""",
                        {"id": p["pair_id"], "k": step["what"], "now": now}, graph=hg)
        if exists:
            return f"{step['what']} is already booked for {_date(exists[0]['at'])}; nothing new booked"
        at = now + int(step.get("in_days") or 7) * DAY_MS
        db.raw("""MATCH (pp:Pair {pair_id: $id})
                  CREATE (pp)-[:HAS_APPOINTMENT]->(:Appointment {appointment_id: $a, kind: $k, status: 'booked', at: $at,
                                                                 note: $why, booked_by: $by})""",
               {"id": p["pair_id"], "a": core._id("A"), "k": step["what"], "at": at, "why": step["why"], "by": self.name}, graph=hg)
        return f"Booked {step['what']} for {_date(at)} at {_city(p['hospital'])}"


def _chase_documents(p: dict, step: dict) -> str:
    """Committee clerk: papers must not be what holds a swap up once time is short."""
    docs = publish.documents(p["pair_id"], p["hospital"])
    missing = [d["type"].replace("_", " ") for d in docs if d["status"] != "verified"]
    if not missing:
        return "All committee papers are verified; nothing to chase"
    db.raw("MATCH (pp:Pair {pair_id: $id}) SET pp.docs_requested_at = $now", {"id": p["pair_id"], "now": personas.clock(p["id"])["now"]})
    core.decide("Committee clerk", "chase", f"Reminder for {', '.join(missing)}", [("Pair", "pair_id", p["pair_id"])], pair_id=p["pair_id"])
    return f"Asked {_city(p['hospital'])} for the {', '.join(missing)}; hospitals usually answer within a week"


def _family_message(p: dict, step: dict) -> str:
    """Patient liaison: a plain message to the family, built from the stage and the case only."""
    first = p["name"].split()[0]
    c = case(p["pair_id"])
    swap = f" A swap has been found ({c['route']}) and the tests are under way." if c else " The team is searching for a swap."
    if step["stage"] == "watch":
        return f"{first}'s recent results are changing faster than we'd like. The team has booked a review to keep a close eye."
    if step["stage"] == "prepare":
        return f"{first}'s results show it's time to get ready for a transplant.{swap} Appointments are booked; we'll message you before each one."
    return f"{first} needs a transplant soon, and the team is treating this as urgent.{swap} Every appointment is booked and missing papers are being chased."


def sweep() -> list[str]:
    """The background watch's duty, every sweep: assess any reading nobody pressed a button for, run open hand-offs,
    and when the pool has changed while an urgent patient waits, let the coordinator agent look again right away."""
    from swapnet.agents import coordinator
    out = []
    for pid in personas.ids():
        p = personas.get(pid)
        try:
            f = HealthWatch().assess(pid)
            if f:
                out.append(f"{pid}: {f['kind']}")
            c = personas.clock(pid)
            st = coordinator.state(p, c["now"])
            if st["pool"]["changed_since_last_search"] and st["urgent"] and st["pair_status"] == "waiting":
                d = coordinator.run_week(p, c["now"], c["week"], trigger="the background watch saw the pool change")
                out.append(f"{pid}: {d['summary']}")
        except Exception:
            continue  # persona not seeded (e.g. mid-reset)
    return out + run_handoffs()

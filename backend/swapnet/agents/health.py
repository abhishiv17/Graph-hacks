"""The health watch, the scheduler and the case manager, for the demo patients (docs/personas.md). Fully agentic: no
step waits for a button. People see every step (findings, events, decisions) and can restart a journey with Replay.

Each simulated week:
1. New families may join the pool (scripted arrivals). Intake agents add them like any family.
2. The case moves one step on its own: the matching agent searches again whenever the pool has changed, the
   crossmatch coordinator runs the tests for the patient's swap, the committee clerk collects the papers and files
   them, the scheduler books the transplant date, and on that date the transplant is recorded as done.
3. The hospital lab sends a new reading. The health watch compares the trend with configured thresholds and with the
   stage it remembers (the persona's memory graph). Only a more urgent stage triggers the stage's playbook, which it
   reads from the graph, handing one Task per step to an agent in the shared exchange graph.
4. Each agent picks up its own open tasks (`run_handoffs`, also called by the background watch every sweep).
"""
import json
import time

from swapnet import config, personas
from swapnet.agents import core
from swapnet.graph import db, publish

DAY_MS = personas.DAY_MS
HEALTH = "Health watch"
SCHEDULER = "Scheduler"
LIVE = ["selected", "offered", "testing", "committee", "locked"]


def ensure_agents() -> None:
    db.raw("UNWIND $a AS a MERGE (g:Agent {name: a[0]}) SET g.kind = a[1]",
           {"a": [[HEALTH, "health"], [SCHEDULER, "scheduler"]]})


def _city(code: str) -> str:
    return next(h["city"] for h in config.hospitals()["hospitals"] if h["code"] == code)


def _date(ms: int) -> str:
    return time.strftime("%d %b", time.localtime(ms / 1000))


class EndOfJourney(ValueError):
    """The journey is over (transplant done, or the scripted readings ran out); replay it to start again."""


# ---------------------------------------------------------------- the patient's case in the shared graph

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


def _note(p: dict, text: str, now: int, week: int) -> None:
    """A step of the case, remembered in the persona's memory graph next to the health watch's findings."""
    rs = personas.readings(p["id"])
    a = personas.assess(p["organ"], [(r["at"], r["value"]) for r in rs])
    facts = {f["key"]: f for f in db.run("Q42_current_facts", {"persona_id": p["id"]}, graph=personas.memory_graph(p["id"]))}
    stage = facts.get("stage", {}).get("value") or a["stage"]
    personas.remember_finding(p["id"], kind="case", stage=stage, previous=stage, a=a, at=now, week=week,
                              text=text, readings=[], triggered=None)


def _pool_size(organ: str) -> int:
    return db.raw("MATCH (q:Pair {organ: $o, status: 'waiting'}) RETURN count(q) AS n", {"o": organ})[0]["n"]


def search(p: dict, why: str) -> str:
    """Matching agent: search around the pair (2 hops, 2-way and 3-way) and, if a swap is worth offering, form it and
    send offers straight away. Remembers the pool size it searched, so the watch searches again only when it changes."""
    loops = core.MatchingAgent().rematch([p["pair_id"]])
    mine = next((l for l in loops if p["pair_id"] in l["pairs"]), None)
    db.raw("MATCH (pp:Pair {pair_id: $id}) SET pp.urgent = true, pp.searched_pool = $n",
           {"id": p["pair_id"], "n": _pool_size(p["organ"])})
    now = personas.clock(p["id"])["now"]
    if mine:
        route = core._route(mine["pairs"])
        personas.update_fact(p["id"], "swap", mine["loop_id"], f"In swap {mine['loop_id']} ({route})", now)
        core.decide("Matching agent", "form_swap", f"{why}: formed {mine['loop_id']} ({route}) and sent offers",
                    [("Loop", "loop_id", mine["loop_id"])], pair_id=p["pair_id"])
        return (f"{why}. Found swap {mine['loop_id']}: {route}, expected {mine['expected_tx']} of {len(mine['pairs'])} "
                "transplants. Offers sent, and the tests are requested")
    personas.update_fact(p["id"], "swap", "none", "No swap in the pool yet; searching again whenever a new family joins", now)
    return f"{why}. No swap in the pool yet; I'll search again whenever a new family joins"


def watch_pool(p: dict) -> str | None:
    """The continuous part: an urgent patient still waiting is searched again as soon as the pool changes."""
    r = db.raw("MATCH (pp:Pair {pair_id: $id}) RETURN pp.status AS s, coalesce(pp.urgent, false) AS u, pp.searched_pool AS n",
               {"id": p["pair_id"]})
    if not r or r[0]["s"] != "waiting" or not r[0]["u"] or r[0]["n"] == _pool_size(p["organ"]):
        return None
    return search(p, "Matching agent: the pool changed since my last search, so I searched again")


def _missing(c: dict) -> list[tuple[str, str, str]]:
    out = []
    for pid, code in zip(c["pairs"], c["codes"]):
        for d in publish.documents(pid, code):
            if d["status"] != "verified":
                out.append((pid, code, d["type"]))
    return out


def progress(p: dict, now: int) -> str | None:
    """Move the patient's case one step, as the agents would in a real week. Returns what happened, if anything."""
    c = case(p["pair_id"])
    if not c:
        return watch_pool(p)
    lid = c["loop_id"]
    if c["status"] in core.TESTABLE:
        res = core.CrossmatchCoordinator().run_lab(lid)
        test = core._loop_organ(lid).test_name
        bad = [x for x in res if x["result"] == "positive"]
        if bad:
            return f"Crossmatch coordinator: a {test} on {lid} failed ({bad[0].get('detail', 'positive')}). The matching agent is repairing the swap"
        return f"Crossmatch coordinator: every {test} on {lid} ({c['route']}) passed. Handed to the committee clerk"
    if c["status"] == "committee":
        missing = _missing(c)
        asked = {r["q"] for r in db.raw("MATCH (q:Pair) WHERE q.pair_id IN $ids AND q.docs_requested = true RETURN q.pair_id AS q",
                                        {"ids": c["pairs"]})}
        ask = [m for m in missing if m[0] not in asked]
        if ask:  # hospitals not asked yet get a request; they answer within the week
            db.raw("MATCH (q:Pair) WHERE q.pair_id IN $ids SET q.docs_requested = true", {"ids": list({m[0] for m in ask})})
            what = "; ".join(f"{_city(code)} {pid}: {t.replace('_', ' ')}" for pid, code, t in ask)
            core.decide("Committee clerk", "chase", f"Requested {what} for {lid}", [("Loop", "loop_id", lid)], pair_id=p["pair_id"])
            return f"Committee clerk: the file for {lid} is missing {what}. Asked the hospitals for them"
        got = []
        for pid, code, t in missing:  # every missing paper was requested at least a week ago: the hospitals have sent it
            db.raw("MATCH (:Pair {pair_id: $id})-[:NEEDS_DOC]->(d:Document {type: $t}) SET d.status = 'verified'",
                   {"id": pid, "t": t}, graph=config.hospital_graph(code))
            got.append(f"{_city(code)} sent the {t.replace('_', ' ')}")
        surgery = now + 7 * DAY_MS
        db.raw("""MATCH (l:Loop {loop_id: $l}) SET l.status = 'locked', l.surgery_at = $at
                  WITH l MATCH (q:Pair)-[:IN_LOOP]->(l) SET q.status = 'locked', q.approval_state = 'approved'""",
               {"l": lid, "at": surgery})
        db.raw("""MATCH (pp:Pair {pair_id: $id})
                  CREATE (pp)-[:HAS_APPOINTMENT]->(:Appointment {appointment_id: $a, kind: 'Transplant surgery', status: 'booked',
                                                                 at: $at, note: $n, booked_by: $by})""",
               {"id": p["pair_id"], "a": core._id("A"), "at": surgery, "by": SCHEDULER,
                "n": f"{lid}: every family's surgery on the same day"}, graph=personas.hospital_graph(p))
        core.decide(SCHEDULER, "book_surgery", f"{lid} surgery booked for {_date(surgery)}", [("Loop", "loop_id", lid)], pair_id=p["pair_id"])
        db.event(SCHEDULER, f"{lid} ({c['route']}): committee file complete; transplant surgery booked for {_date(surgery)}, "
                            "same day for every family. Synthetic.", "ok")
        personas.update_fact(p["id"], "swap", f"{lid}:booked", f"In swap {lid} ({c['route']}); transplant booked for {_date(surgery)}", now)
        return ((f"Committee clerk: {', '.join(got)}. " if got else "Committee clerk: every paper was already in. ")
                + "The file is complete and filed with the authorisation committee (synthetic approval). "
                  f"Scheduler: transplant surgery booked for {_date(surgery)}, the same day for every family in {lid}")
    if c["status"] == "locked" and c["surgery_at"] and c["surgery_at"] <= now and not c["transplanted_at"]:
        db.raw("""MATCH (l:Loop {loop_id: $l}) SET l.transplanted_at = $now
                  WITH l MATCH (q:Pair)-[:IN_LOOP]->(l) SET q.status = 'transplanted'""", {"l": lid, "now": now})
        db.raw("MATCH (:Pair {pair_id: $id})-[:HAS_APPOINTMENT]->(a:Appointment {kind: 'Transplant surgery'}) SET a.status = 'done'",
               {"id": p["pair_id"]}, graph=personas.hospital_graph(p))
        db.event(SCHEDULER, f"{lid} ({c['route']}): transplant surgery done for every family (synthetic).", "ok")
        personas.update_fact(p["id"], "swap", f"{lid}:done", f"Transplanted through swap {lid} ({c['route']}) on {_date(now)}", now)
        return f"Transplant done: {lid} ({c['route']}), every family on the same day (synthetic). The journey is complete"
    return None


# ---------------------------------------------------------------- one simulated week

def advance(pid: str) -> dict:
    p = personas.get(pid)
    if db.raw("MATCH (pp:Pair {pair_id: $id}) RETURN pp.status AS s", {"id": p["pair_id"]})[0]["s"] == "transplanted":
        raise EndOfJourney(f"{p['name']}'s transplant is done; replay the journey to start again")
    c = personas.clock(pid)
    week = c["week"] + 1
    if week > len(p["future"]):
        raise EndOfJourney(f"{p['name']}'s scripted journey has no more readings; replay it to start again")
    now = c["base"] + week * personas.WEEK_MS
    db.raw("MATCH (me:Person {persona_id: $p}) SET me.week = $w", {"p": pid, "w": week}, graph=personas.memory_graph(pid))
    steps = []
    spec = (p.get("arrivals") or {}).get(week)
    if spec:
        core.IntakeAgent(spec["hospital"]).add_pair(personas.arrival_pair(spec))
        steps.append(f"Intake agent: a new {spec['organ']} family ({spec['pair_id']}) joined the pool in {_city(spec['hospital'])}")
    done = progress(p, now)
    if done:
        steps.append(done)
    for s in steps:
        _note(p, s, now, week)
    finding = None
    if db.raw("MATCH (pp:Pair {pair_id: $id}) RETURN pp.status AS s", {"id": p["pair_id"]})[0]["s"] != "transplanted":
        finding = _new_reading(p, week, now)
    return {"week": week, "steps": steps, "finding": finding, "handoffs_run": run_handoffs()}


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


# ---------------------------------------------------------------- health watch

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
        fid = personas.remember_finding(pid, kind=kind, stage=a["stage"], previous=before, a=a, at=last["at"], week=last["week"],
                                        text=text, readings=rows[-4:], triggered=a["stage"] if acts else None)
        personas.update_facts(pid, a, last["at"])
        db.event(self.name, f"{p['pair_id']} ({p['name']}): {text}", "warn" if worse else "info")
        tasks = []
        if acts:
            core.decide(self.name, "stage_change", text, [("Pair", "pair_id", p["pair_id"])], pair_id=p["pair_id"])
            tasks = self._hand_off(p, fid, a, in_swap=c is not None)
        return {"finding_id": fid, "kind": kind, "stage": a["stage"], "previous_stage": before, "text": text, "tasks": tasks}

    def _hand_off(self, p: dict, fid: str, a: dict, in_swap: bool) -> list[str]:
        """Read the stage's playbook from memory and give each step to its agent as a Task in the exchange graph."""
        steps = db.run("Q44_playbook", {"persona_id": p["id"], "stage": a["stage"]}, graph=personas.memory_graph(p["id"]))
        if in_swap:  # already in a swap: no new search
            steps = [s for s in steps if s["action"] != "urgent_search"]
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


# ---------------------------------------------------------------- each agent picks up its own tasks

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
        fn = {"book": Scheduler().book, "urgent_search": _urgent_search, "chase_documents": _chase_documents,
              "message": _family_message}.get(r["action"])
        result = fn(p, step) if fn else f"No handler for {r['action']}"
        db.raw("MATCH (t:Task {task_id: $t}) SET t.status = 'done', t.done_at = timestamp(), t.result = $r", {"t": r["tid"], "r": result})
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


def _urgent_search(p: dict, step: dict) -> str:
    """Matching agent: mark the pair urgent (it gets the urgent priority bonus) and form a swap if the pool has one."""
    return search(p, f"Marked {p['pair_id']} urgent and searched 2-way, then 3-way swaps around it")


def _chase_documents(p: dict, step: dict) -> str:
    """Committee clerk: papers must not be what holds a swap up once time is short."""
    docs = publish.documents(p["pair_id"], p["hospital"])
    missing = [d["type"].replace("_", " ") for d in docs if d["status"] != "verified"]
    if not missing:
        return "All committee papers are verified; nothing to chase"
    db.raw("MATCH (pp:Pair {pair_id: $id}) SET pp.docs_requested = true", {"id": p["pair_id"]})
    core.decide("Committee clerk", "chase", f"Reminder for {', '.join(missing)}", [("Pair", "pair_id", p["pair_id"])], pair_id=p["pair_id"])
    return f"Reminder sent to {_city(p['hospital'])}: {', '.join(missing)} still missing. Flagged as urgent"


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
    """The background watch's duty, every sweep: assess any reading nobody pressed a button for, search again for any
    urgent patient still waiting if the pool changed, then run open hand-offs."""
    out = []
    for pid in personas.ids():
        p = personas.get(pid)
        try:
            f = HealthWatch().assess(pid)
            if f:
                out.append(f"{pid}: {f['kind']}")
            s = watch_pool(p)
            if s:
                c = personas.clock(pid)
                _note(p, s, c["now"], c["week"])
                out.append(f"{pid}: {s}")
        except Exception:
            continue  # persona not seeded (e.g. mid-reset)
    return out + run_handoffs()

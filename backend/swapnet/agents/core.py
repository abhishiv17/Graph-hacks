"""KindRed agents. They share state only through the graph (Offer, Crossmatch, Task,
Decision and Event nodes), so a hand-off survives a restart and every action is auditable.

Matches are chosen by the optimiser from loops the graph found. Agents act on that, and a
person approves every repair. Text shown to people is built from returned graph facts.
"""
import json
import threading
import time
import uuid

from swapnet import config
from swapnet.agents import lab, narrate
from swapnet.graph import db, publish
from swapnet.optimiser.solver import Candidate, best_fallback, expected_transplants, rank_repairs, solve

DAY_MS = 86_400_000
# Serialises graph writes between API requests and the background watch.
LOCK = threading.RLock()
COORDINATOR = "Exchange coordinator (person)"


def _id(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:6]}"


def ensure_agents() -> None:
    names = [("Matching agent", "matching"), ("Crossmatch coordinator", "crossmatch"),
             ("Committee clerk", "committee"), ("Patient liaison", "liaison"),
             ("Exchange coordinator (person)", "human")]
    names += [(f"Intake agent · {h['city']}", "intake") for h in config.hospitals()["hospitals"]]
    db.raw("UNWIND $a AS a MERGE (g:Agent {name: a[0]}) SET g.kind = a[1]", {"a": [list(x) for x in names]})


def decide(agent: str, action: str, rationale: str, based_on: list[tuple[str, str, str]],
           approved_by: str | None = None, pair_id: str | None = None) -> str:
    """Write a Decision with BASED_ON edges to the facts it used, e.g. ("Loop", "loop_id", "S-0031")."""
    did = _id("D")
    db.raw("CREATE (d:Decision {decision_id: $id, action: $action, rationale: $r, at: timestamp(), pair_id: $pair}) "
           "WITH d MATCH (g:Agent {name: $agent}) CREATE (d)-[:MADE_BY]->(g)",
           {"id": did, "action": action, "r": rationale, "agent": agent, "pair": pair_id})
    for label, key, val in based_on:
        db.raw(f"MATCH (d:Decision {{decision_id: $id}}), (x:{label} {{{key}: $v}}) CREATE (d)-[:BASED_ON]->(x)",
               {"id": did, "v": val})
    if approved_by:
        db.raw("MATCH (d:Decision {decision_id: $id}), (g:Agent {name: $n}) CREATE (d)-[:APPROVED_BY]->(g)",
               {"id": did, "n": approved_by})
    return did


def _city(pair_id: str) -> str:
    r = db.raw("MATCH (:Pair {pair_id: $p})-[:REGISTERED_AT]->(h:Hospital) RETURN h.city AS c, h.code AS code", {"p": pair_id})
    return r[0]["c"] if r else "?"


def _code(pair_id: str) -> str:
    r = db.raw("MATCH (:Pair {pair_id: $p})-[:REGISTERED_AT]->(h:Hospital) RETURN h.code AS code", {"p": pair_id})
    return r[0]["code"] if r else "?"


def _route(pairs: list[str]) -> str:
    cities = [_city(p) for p in pairs]
    return " ⇄ ".join(cities) if len(cities) == 2 else " → ".join(cities)


def _priority_bonus() -> dict[str, float]:
    b = config.policies()["matching"]["priority_bonus"]
    rows = db.raw("MATCH (p:Pair {status: 'waiting'})-[:HAS_PATIENT]->(r:Patient) "
                  "RETURN p.pair_id AS id, r.abo AS abo, r.cpra AS cpra, coalesce(p.failed_count, 0) AS f")
    return {r["id"]: (b["blood_o_patient"] if r["abo"] == "O" else 0) + (b["high_cpra"] if r["cpra"] > 85 else 0)
            + (b["failed_before"] if r["f"] > 0 else 0) for r in rows}


def _with_fallbacks(rows: list[dict]) -> list[Candidate]:
    cands = [Candidate(r["pairs"], r["probs"]) for r in rows]
    threes = [c for c in cands if len(c.pairs) == 3]
    if threes:
        fb = db.run("Q06_fallbacks_inside", {"loops": [c.pairs for c in threes]})
        by = {tuple(r["loop"]): r for r in fb}
        for c in threes:
            r = by.get(tuple(c.pairs), {})
            opts = [x for x in (r.get("fb_xy"), r.get("fb_yz"), r.get("fb_zx")) if x]
            best_fallback(c, opts)
    return cands


def _dedupe(rows: list[dict]) -> list[dict]:
    """The same loop can come back once per released pair it passes through (as a rotation)."""
    seen, out = set(), []
    for r in rows:
        ps = r["pairs"]
        k = ps.index(min(ps))
        key = tuple(ps[k:] + ps[:k])
        if key not in seen:
            seen.add(key)
            out.append({"pairs": list(key), "probs": r["probs"][k:] + r["probs"][:k]})
    return out


def _offer_accepted(loop_id: str, pair_id: str) -> None:
    """The receiving hospital accepted the link into this pair, so its refusal risk is gone."""
    link = next((l for l in db.run("Q13_explain_loop", {"loop_id": loop_id}) if l["to_pair"] == pair_id), None)
    if not link:
        return
    db.raw("""MATCH (:Pair {pair_id: $a})-[e:CAN_GIVE_TO]->(:Pair {pair_id: $b})
              WHERE coalesce(e.offer_accepted, false) = false AND coalesce(e.lab_negative, false) = false
              WITH e, e.p_success / (1.0 - $r) AS p
              SET e.offer_accepted = true,
                  e.p_success = round(CASE WHEN p > 0.99 THEN 0.99 ELSE p END * 100) / 100.0,
                  e.reasons = e.reasons + ['offer accepted: no refusal risk left on this link']""",
           {"a": link["from_pair"], "b": link["to_pair"], "r": config.params()["failure"]["offer_refusal"]})


def _refresh_loop(loop_id: str) -> None:
    """Recompute a loop's chances from its links' current estimates (after offers or lab results)."""
    links = db.run("Q13_explain_loop", {"loop_id": loop_id})
    if not links:
        return
    pairs = [l["from_pair"] for l in links]
    c = Candidate(pairs, [l["p_success"] for l in links])
    fb = db.raw("""MATCH (fb:Loop)-[:FALLBACK_FOR]->(:Loop {loop_id: $l})
                   MATCH (x:Pair)-[r:IN_LOOP]->(fb) WITH fb, x ORDER BY r.pos
                   RETURN fb.loop_id AS id, collect(x.pair_id) AS pairs""", {"l": loop_id})
    if fb and len(pairs) == 3:
        x, y = fb[0]["pairs"]
        if pairs[(pairs.index(x) + 1) % 3] != y:
            x, y = y, x                      # x -> y is the link inside the main loop
        back = db.raw("MATCH (:Pair {pair_id: $y})-[e:CAN_GIVE_TO]->(:Pair {pair_id: $x}) RETURN e.p_success AS p",
                      {"x": x, "y": y})
        if back:
            c.fallback = [x, y, back[0]["p"]]
            p_fb = c.probs[pairs.index(x)] * back[0]["p"]
            db.raw("MATCH (l:Loop {loop_id: $l}) SET l.p_success = $p, l.expected_tx = $e",
                   {"l": fb[0]["id"], "p": round(p_fb, 2), "e": round(2 * p_fb, 2)})
    db.raw("MATCH (l:Loop {loop_id: $l}) SET l.p_success = $p, l.expected_tx = $e",
           {"l": loop_id, "p": round(c.p_all, 2), "e": round(expected_transplants(c), 2)})


def _next_loop_id() -> int:
    r = db.raw("MATCH (l:Loop) WHERE l.loop_id STARTS WITH 'S-' RETURN count(l) AS n")
    return 31 + (r[0]["n"] if r else 0)


def _save(chosen: list[Candidate], run_id: str, policy: str, meta: dict, first: str | None = None) -> list[dict]:
    if first:
        chosen = sorted(chosen, key=lambda c: first not in c.pairs)
    n0 = _next_loop_id()
    loops = []
    for i, c in enumerate(chosen):
        loops.append({"loop_id": f"S-{n0 + i:04d}", "kind": f"{len(c.pairs)}-way", "pairs": c.pairs,
                      "p_success": round(c.p_all, 2), "expected_tx": round(c.expected, 2),
                      "has_fallback": bool(c.fallback), "fallback": c.fallback})
    db.run("Q08_save_plan", {"run_id": run_id, "policy": policy, "solve_ms": meta["solve_ms"],
                             "optimal": meta["optimal"], "expected_tx": meta["expected_tx"],
                             "planned_tx": meta["planned_tx"], "loops": loops})
    for l in loops:  # store the 2-way fallback as its own Loop, ready to use
        if l["fallback"]:
            x, y, _ = l["fallback"]
            fid = l["loop_id"] + "-FB"
            db.raw("""MATCH (a:Pair {pair_id: $x})-[e1:CAN_GIVE_TO]->(b:Pair {pair_id: $y})-[e2:CAN_GIVE_TO]->(a)
                      MATCH (main:Loop {loop_id: $main})
                      CREATE (fb:Loop {loop_id: $fid, kind: '2-way', organ: 'kidney', status: 'fallback',
                                       p_success: round(e1.p_success * e2.p_success * 100) / 100.0,
                                       expected_tx: round(2 * e1.p_success * e2.p_success * 100) / 100.0,
                                       has_fallback: false, created_at: timestamp()})
                      CREATE (fb)-[:FALLBACK_FOR {trigger: $trigger}]->(main)
                      CREATE (a)-[:IN_LOOP {pos: 0}]->(fb), (b)-[:IN_LOOP {pos: 1}]->(fb)""",
                   {"x": x, "y": y, "main": l["loop_id"], "fid": fid,
                    "trigger": [p for p in l["pairs"] if p not in (x, y)][0]})
    return loops


# ---------------------------------------------------------------- intake agents

class IntakeAgent:
    """One per hospital: adds pairs and answers offers with accept, decline or hold."""

    def __init__(self, code: str):
        self.code = code
        h = next(x for x in config.hospitals()["hospitals"] if x["code"] == code)
        self.name = f"Intake agent · {h['city']}"
        pol = config.policies()
        self.policy = {**pol["default"], **(pol.get("hospitals") or {}).get(code, {})}

    def add_pair(self, pr) -> dict:
        publish.write_private(pr)
        res = publish.publish(pr)
        if res["published"]:
            db.event(self.name, f"Added pair {pr.pair_id}. {res['edges']} new compatibility links in the shared pool.", "intake")
        else:
            db.event(self.name, f"Pair {pr.pair_id} not added: {res.get('reason', 'unknown reason')}.", "warn")
        return res

    def respond(self, offer_id: str) -> str:
        r = db.raw("""MATCH (o:Offer {offer_id: $o})-[:TO]->(p:Pair), (o)-[:FOR]->(l:Loop)
                      MATCH (q:Pair)-[e:CAN_GIVE_TO]->(p) WHERE (q)-[:IN_LOOP]->(l)
                      RETURN p.pair_id AS pair, p.approval_state AS ap, e.vxm AS vxm, l.loop_id AS loop""", {"o": offer_id})
        if not r:
            return "pending"
        r = r[0]
        if r["ap"] == "rejected":
            resp, why = "decline", "committee rejected this pair"
        elif r["vxm"] == "risk" and self.policy["hold_if_vxm_risk"]:
            resp, why = "hold", "incoming link has an untyped locus; lab test first"
        else:
            resp, why = "accept", "policy checks passed; lab crossmatch requested"
        db.raw("MATCH (o:Offer {offer_id: $o}) SET o.response = $r, o.reason = $w, o.at = timestamp()",
               {"o": offer_id, "r": resp, "w": why})
        decide(self.name, resp, why, [("Offer", "offer_id", offer_id), ("Loop", "loop_id", r["loop"])], pair_id=r["pair"])
        if resp == "accept":
            _offer_accepted(r["loop"], r["pair"])
        return resp


    def resolve_hold(self, loop_id: str, pair_id: str) -> bool:
        """A held offer waits for the lab test on the link into this pair. Called once that test is negative."""
        held = db.raw("""MATCH (o:Offer {response: 'hold'})-[:FOR]->(:Loop {loop_id: $l}), (o)-[:TO]->(:Pair {pair_id: $p})
                         RETURN o.offer_id AS o""", {"l": loop_id, "p": pair_id})
        for h in held:
            why = "held until the lab test; crossmatch came back negative"
            db.raw("MATCH (o:Offer {offer_id: $o}) SET o.response = 'accept', o.reason = $w, o.at = timestamp()",
                   {"o": h["o"], "w": why})
            decide(self.name, "accept", why, [("Offer", "offer_id", h["o"]), ("Loop", "loop_id", loop_id)], pair_id=pair_id)
            db.event(self.name, f"Hold released for {pair_id} in {loop_id}: lab test negative, offer accepted.", "ok")
        if held:
            _refresh_loop(loop_id)
        return bool(held)


def intake_for(pair_id: str) -> IntakeAgent:
    return IntakeAgent(_code(pair_id))


# ---------------------------------------------------------------- crossmatch coordinator

class CrossmatchCoordinator:
    name = "Crossmatch coordinator"

    def request(self, loop_id: str, carry_over: dict | None = None) -> None:
        """One lab test per link. Links already tested negative carry over (no repeat test)."""
        links = db.run("Q13_explain_loop", {"loop_id": loop_id})
        carry_over = carry_over or {}
        for l in links:
            key = (l["from_pair"], l["to_pair"])
            tid = f"X-{loop_id}-{l['from_pair'][-4:]}-{l['to_pair'][-4:]}"
            result = carry_over.get(key, "pending")
            db.raw("""MATCH (a:Pair {pair_id: $a}), (b:Pair {pair_id: $b}), (lp:Loop {loop_id: $l})
                      CREATE (x:Crossmatch {test_id: $t, result: $res, lab: $lab, requested_at: timestamp(),
                                             due_at: timestamp() + 2 * $day})
                      CREATE (x)-[:DONOR_OF]->(a), (x)-[:PATIENT_OF]->(b), (x)-[:IN]->(lp)""",
                   {"a": l["from_pair"], "b": l["to_pair"], "l": loop_id, "t": tid, "res": result,
                    "lab": _code(l["to_pair"]) + "-LAB", "day": DAY_MS})
        db.raw("MATCH (l:Loop {loop_id: $l}) SET l.status = 'testing'", {"l": loop_id})

    def run_lab(self, loop_id: str) -> list[dict]:
        """Send pending tests to the (simulated) lab and act on the results."""
        tests = db.raw("""MATCH (x:Crossmatch {result: 'pending'})-[:IN]->(:Loop {loop_id: $l})
                          MATCH (x)-[:DONOR_OF]->(a:Pair), (x)-[:PATIENT_OF]->(b:Pair)
                          RETURN x.test_id AS t, a.pair_id AS a, b.pair_id AS b""", {"l": loop_id})
        out = []
        for t in tests:
            res = lab.crossmatch(t["a"], _code(t["a"]), t["b"])
            out.append({**t, **res})
            self.record(t["t"], res["result"], res.get("antibody"), res.get("mfi"))
            if res["result"] == "positive":
                break  # the loop is broken; the rest of its tests are moot
        return out

    def record(self, test_id: str, result: str, antibody: str | None = None, mfi: int | None = None) -> None:
        r = db.raw("""MATCH (x:Crossmatch {test_id: $t})-[:IN]->(l:Loop)
                      MATCH (x)-[:DONOR_OF]->(a:Pair), (x)-[:PATIENT_OF]->(b:Pair)
                      SET x.result = $res, x.antibody = $ab, x.at = timestamp()
                      RETURN l.loop_id AS loop, a.pair_id AS a, b.pair_id AS b""",
                   {"t": test_id, "res": result, "ab": antibody})[0]
        route = f"{_city(r['a'])} → {_city(r['b'])}"
        if result == "negative":
            # A negative lab test is strong evidence: only refusal or withdrawal can still stop this link.
            db.raw("""MATCH (:Pair {pair_id: $a})-[e:CAN_GIVE_TO]->(:Pair {pair_id: $b})
                      SET e.p_success = 0.95, e.vxm = 'clear', e.lab_negative = true,
                          e.reasons = [r IN e.reasons WHERE NOT r STARTS WITH 'lab ' AND NOT r CONTAINS 'not typed'] + ['lab crossmatch negative']""",
                   {"a": r["a"], "b": r["b"]})
            db.event(self.name, f"{_city(r['b'])} lab: negative crossmatch on {route} ({r['a']} → {r['b']}).", "ok")
            _refresh_loop(r["loop"])
            intake_for(r["b"]).resolve_hold(r["loop"], r["b"])
            self._maybe_complete(r["loop"])
            return
        db.event(self.name, f"{_city(r['b'])} lab: positive crossmatch on link {r['a']} → {r['b']}"
                            f" ({antibody} antibody, MFI {mfi}). Loop paused, matching agent notified.", "fail")
        MatchingAgent().on_failure(r["loop"], r["a"], r["b"], "positive_xm",
                                   f"lab crossmatch positive ({antibody} antibody, not typed in advance)", test_id)

    def check_overdue(self, now: int | None = None) -> list[str]:
        """Pending tests past their due date get one reminder to the lab; a day later the coordinator is told."""
        now = now or int(time.time() * 1000)
        rows = db.raw("""MATCH (x:Crossmatch {result: 'pending'})-[:IN]->(l:Loop) WHERE x.due_at < $now
                           AND l.status = 'testing' AND coalesce(x.reminders, 0) < 2
                         MATCH (x)-[:DONOR_OF]->(a:Pair), (x)-[:PATIENT_OF]->(b:Pair)
                         RETURN x.test_id AS t, x.lab AS lab, coalesce(x.reminders, 0) AS n, x.due_at AS due,
                                l.loop_id AS loop, a.pair_id AS a, b.pair_id AS b""", {"now": now})
        out = []
        for r in rows:
            if r["n"] == 1 and now - r["due"] < DAY_MS:
                continue
            db.raw("MATCH (x:Crossmatch {test_id: $t}) SET x.reminders = coalesce(x.reminders, 0) + 1, x.reminded_at = $now",
                   {"t": r["t"], "now": now})
            if r["n"] == 0:
                msg = f"{r['lab']}: lab test {r['a']} → {r['b']} for {r['loop']} is overdue. Reminder sent."
            else:
                msg = f"{r['lab']}: lab test {r['a']} → {r['b']} still overdue. Exchange coordinator alerted; {r['loop']} is on hold."
            db.event(self.name, msg, "warn")
            out.append(msg)
        return out

    def _maybe_complete(self, loop_id: str) -> None:
        left = db.raw("MATCH (x:Crossmatch)-[:IN]->(:Loop {loop_id: $l}) WHERE x.result <> 'negative' RETURN count(x) AS n",
                      {"l": loop_id})[0]["n"]
        if left == 0:
            db.raw("MATCH (l:Loop {loop_id: $l}) SET l.status = 'committee'", {"l": loop_id})
            db.event(self.name, f"All lab tests negative for {loop_id}. Handed to the committee clerk.", "ok")


# ---------------------------------------------------------------- matching agent

class MatchingAgent:
    name = "Matching agent"

    def run_plan(self, failure_aware: bool = True, first: str | None = None, max_loop: int = 3) -> dict:
        with db.track() as tr:
            comps = db.run("Q07_components")
            rows = db.run("Q04_two_way_loops", {"ids": None})
            if max_loop >= 3:
                rows += db.run("Q05_three_way_loops", {"ids": None})
            cands = _with_fallbacks(rows)
            res = solve(cands, _priority_bonus(), failure_aware=failure_aware)
            run_id = f"#{self._run_no()}"
            loops = _save(res["chosen"], run_id, "failure-aware" if failure_aware else "failure-blind", res, first)
        db.event(self.name, f"Plan {run_id}: {len(comps)} component(s), {res['candidates']} candidate loops found in "
                            f"the graph, {len(loops)} chosen in {res['solve_ms'] / 1000:.1f} s"
                            f"{' · optimal' if res['optimal'] else ''}. Expected {res['expected_tx']} of "
                            f"{res['planned_tx']} transplants.", "plan")
        decide(self.name, "select_plan", f"Optimiser chose {len(loops)} loops by expected transplants, then priority.",
               [("Plan", "run_id", run_id)])
        for l in loops:
            self.offer(l["loop_id"])
        return {"run_id": run_id, "loops": loops, **{k: res[k] for k in ("optimal", "solve_ms", "expected_tx", "planned_tx", "candidates")},
                "components": len(comps), "queries": tr.ran}

    def _run_no(self) -> int:
        return 41 + db.raw("MATCH (p:Plan) RETURN count(p) AS n")[0]["n"]

    def offer(self, loop_id: str, carry_over: dict | None = None) -> None:
        n = db.run("Q09_offer_loop", {"loop_id": loop_id})
        if not n or not n[0]["offers"]:
            db.event(self.name, f"{loop_id} not offered: a pair is already in another offer.", "warn")
            return
        offers = db.raw("MATCH (o:Offer)-[:FOR]->(:Loop {loop_id: $l}) MATCH (o)-[:TO]->(p:Pair) "
                        "RETURN o.offer_id AS o, p.pair_id AS p", {"l": loop_id})
        held = []
        for o in offers:
            if intake_for(o["p"]).respond(o["o"]) == "hold":
                held.append(o["p"])
        CrossmatchCoordinator().request(loop_id, carry_over)
        _refresh_loop(loop_id)
        if held:
            db.event(self.name, f"{loop_id}: {len(held)} offer(s) on hold until the lab test "
                                f"({', '.join(_city(p) + ' ' + p for p in held)}). Each hold is released if the test is negative.", "info")

    def on_failure(self, loop_id: str, donor_pair: str, patient_pair: str, cause: str, detail: str, test_id: str | None) -> dict:
        t0 = time.perf_counter()
        fid = _id("F")
        with db.track() as tr:
            db.raw("""MATCH (o:Offer)-[:FOR]->(:Loop {loop_id: $l}) WHERE o.response IN ['hold', 'pending']
                      SET o.response = 'withdrawn', o.reason = 'loop broken by a failed lab test'""", {"l": loop_id})
            released = db.run("Q10_record_failure", {"donor_pair": donor_pair, "patient_pair": patient_pair,
                                                     "loop_id": loop_id, "cause": cause, "detail": detail,
                                                     "test_id": test_id, "failure_id": fid})[0]["released"]
            # The lab now knows the donor's full typing: type it and rebuild only that donor's links.
            self._learn_typing(donor_pair)
            db.run("Q17_failure_priors", {"lab": _code(patient_pair) + "-LAB"})
            fallbacks = db.run("Q12_fallbacks_for", {"loop_id": loop_id})
            rows = _dedupe(db.run("Q11_local_repair_candidates", {"released": released}))
            cands = _with_fallbacks(rows)
            ranked = rank_repairs(cands, released, _priority_bonus())
        best = ranked[0] if ranked else None
        ms = round((time.perf_counter() - t0) * 1000)
        comps = len(db.run("Q07_components"))
        locked = db.raw("MATCH (l:Loop) WHERE l.status IN ['offered','testing','committee','locked'] RETURN count(l) AS n")[0]["n"]
        threshold = config.policies()["matching"]["escalate_below_expected"]
        proposal = {
            "broken_loop": loop_id, "failure_id": fid, "failed_link": [donor_pair, patient_pair], "detail": detail,
            "released": released, "found_ms": ms, "candidates": len(cands), "untouched_loops": locked,
            "recommended": _cand_json(best) if best else None,
            "alternatives": [_cand_json(c) for c in ranked[1:3]],
            "fallback": fallbacks[0] if fallbacks else None, "queries": tr.ran,
        }
        if best and best.expected >= threshold:
            proposal["why"] = self._why(best)
            task = self._task("approve_repair", loop_id, proposal)
            newcomers = [p for p in best.pairs if p not in released]
            db.event(self.name, f"Re-planned only the pairs around the break: {len(cands)} candidate loops through the "
                                f"released pairs, best found in {ms / 1000:.1f} s. Other {locked} loops untouched. "
                                f"Waiting for coordinator approval.", "plan")
            decide(self.name, "propose_repair",
                   f"Recommend {_route(best.pairs)} (expected {best.expected:.1f} of {len(best.pairs)})"
                   + (f"; {', '.join(newcomers)} joins" if newcomers else ""),
                   [("Loop", "loop_id", loop_id), ("Failure", "failure_id", fid)])
            proposal["task_id"] = task
        else:
            task = self._task("escalate", loop_id, proposal)
            db.event(self.name, f"No repair above {threshold} expected transplants for {loop_id}. Escalated to the "
                                f"exchange coordinator with {len(cands)} options.", "warn")
            decide(self.name, "escalate", "No repair reaches the threshold; a person decides.",
                   [("Loop", "loop_id", loop_id), ("Failure", "failure_id", fid)])
            proposal["task_id"] = task
        db.raw("MATCH (p:Pair {pair_id: $p}) SET p.priority = coalesce(p.priority, 0) + 0.2", {"p": patient_pair})
        return proposal

    def _learn_typing(self, donor_pair: str) -> None:
        code = _code(donor_pair)
        full = db.raw("MATCH (:Pair {pair_id: $id})-[:DONOR]->(d:Person) RETURN d.full_typing AS t",
                      {"id": donor_pair}, graph=config.hospital_graph(code))[0]["t"]
        db.raw("MATCH (:Pair {pair_id: $id})-[e:CAN_GIVE_TO {status: 'live'}]->() "
               "WHERE coalesce(e.lab_negative, false) = false DELETE e", {"id": donor_pair})
        db.raw("""MATCH (:Pair {pair_id: $id})-[:HAS_DONOR]->(d:Donor)
                  SET d.untyped_loci = []
                  WITH d UNWIND $dq AS n
                  MERGE (h:HLAAntigen {name: n}) ON CREATE SET h.locus = 'DQ'
                  MERGE (d)-[:HAS_ANTIGEN]->(h)""",
               {"id": donor_pair, "dq": [a for a in full if a.startswith("DQ")]})
        publish.build(donor_pair)

    def _why(self, c: Candidate) -> list[str]:
        out = []
        for i, a in enumerate(c.pairs):
            b = c.pairs[(i + 1) % len(c.pairs)]
            e = db.raw("MATCH (:Pair {pair_id: $a})-[e:CAN_GIVE_TO]->(:Pair {pair_id: $b}) RETURN e.reasons AS r", {"a": a, "b": b})
            out.append(f"{_city(a)} donor → {_city(b)} patient: " + "; ".join(e[0]["r"]))
        return out

    def _task(self, kind: str, loop_id: str, proposal: dict) -> str:
        tid = _id("T")
        db.raw("""CREATE (t:Task {task_id: $t, kind: $k, status: 'open', created_at: timestamp(), payload: $p})
                  WITH t MATCH (l:Loop {loop_id: $l}), (g:Agent {name: 'Exchange coordinator (person)'})
                  CREATE (t)-[:ABOUT]->(l), (t)-[:ASSIGNED_TO]->(g)""",
               {"t": tid, "k": kind, "p": json.dumps(proposal, default=str), "l": loop_id})
        return tid

    def approve(self, task_id: str, choice: str = "recommended", approver: str = "Exchange coordinator (person)") -> dict:
        t = db.raw("MATCH (t:Task {task_id: $t, status: 'open'}) RETURN t.payload AS p", {"t": task_id})
        if not t:
            return {"error": "task not open"}
        prop = json.loads(t[0]["p"])
        pick = prop["recommended"] if choice == "recommended" else (
            prop["fallback"] and {"pairs": prop["fallback"]["pairs"], "probs": None} if choice == "fallback"
            else prop["alternatives"][int(choice.split(":")[1])])
        if not pick:
            return {"error": "nothing to approve"}
        if choice == "fallback":
            rows = db.run("Q04_two_way_loops", {"ids": pick["pairs"]})
            rows = [r for r in rows if set(r["pairs"]) == set(pick["pairs"])]
        else:
            rows = [{"pairs": pick["pairs"], "probs": pick["probs"]}]
        cands = _with_fallbacks(rows)
        res = solve(cands, failure_aware=True)
        loops = _save(res["chosen"], f"repair-{task_id}", "repair", res)
        new_id = loops[0]["loop_id"]
        db.raw("MATCH (a:Loop {loop_id: $a}), (b:Loop {loop_id: $b}) CREATE (a)-[:REPLACED_BY {task: $t}]->(b)",
               {"a": prop["broken_loop"], "b": new_id, "t": task_id})
        db.raw("MATCH (t:Task {task_id: $t}) SET t.status = 'done', t.done_at = timestamp(), t.result = $n",
               {"t": task_id, "n": new_id})
        decide(self.name, "approve_repair", f"{_route(pick['pairs'])} replaces {prop['broken_loop']} as {new_id}.",
               [("Loop", "loop_id", prop["broken_loop"]), ("Failure", "failure_id", prop["failure_id"]),
                ("Loop", "loop_id", new_id)], approved_by=approver)
        db.event(approver, f"Approved repair: {new_id} {_route(pick['pairs'])}. New offers sent.", "ok")
        carry = {(r["a"], r["b"]): "negative" for r in db.raw(
            """MATCH (x:Crossmatch {result: 'negative'})-[:IN]->(:Loop {loop_id: $l})
               MATCH (x)-[:DONOR_OF]->(a:Pair), (x)-[:PATIENT_OF]->(b:Pair) RETURN a.pair_id AS a, b.pair_id AS b""",
            {"l": prop["broken_loop"]})}
        self.offer(new_id, carry)
        left = [p for p in prop["released"] if p not in pick["pairs"]]
        rematched = self.rematch(left) if left else []
        return {"loop_id": new_id, "pairs": pick["pairs"], "rematched": rematched}

    def decline(self, task_id: str, reason: str, by: str = COORDINATOR) -> dict:
        """A person rejects the proposed repair. Recorded with the reason; released families go back to matching,
        never into the loop that was just declined."""
        t = db.raw("MATCH (t:Task {task_id: $t, status: 'open'})-[:ABOUT]->(l:Loop) RETURN t.payload AS p, l.loop_id AS l", {"t": task_id})
        if not t:
            return {"error": "task not open"}
        prop = json.loads(t[0]["p"])
        avoid = (prop.get("recommended") or {}).get("pairs") or []
        db.raw("MATCH (t:Task {task_id: $t}) SET t.status = 'declined', t.done_at = timestamp(), t.result = $r, t.declined_by = $by",
               {"t": task_id, "r": reason, "by": by})
        decide(self.name, "decline_repair", f"Repair declined: {reason}",
               [("Loop", "loop_id", prop["broken_loop"]), ("Failure", "failure_id", prop["failure_id"])], approved_by=by)
        db.event(by, f"Declined the repair for {prop['broken_loop']}: {reason}. Released families go back to matching.", "warn")
        db.raw("MATCH (p:Pair) WHERE p.pair_id IN $ids AND p.status = 'waiting' SET p.needs_rematch = true, p.avoid = $avoid",
               {"ids": prop["released"], "avoid": avoid})
        rematched = self.rematch(prop["released"], avoid=[avoid] if avoid else [])
        return {"declined": prop["broken_loop"], "rematched": rematched}

    def rematch(self, pair_ids: list[str], avoid: list[list[str]] | None = None) -> list[dict]:
        """Find a new loop for families that are waiting again, searching only around them (no full re-plan).
        Families already promised to a loop are never touched."""
        waiting = [r["p"] for r in db.raw("MATCH (p:Pair) WHERE p.pair_id IN $ids AND p.status = 'waiting' RETURN p.pair_id AS p",
                                          {"ids": pair_ids})]
        if not waiting:
            return []
        avoid_sets = [set(a) for a in (avoid or [])]
        avoid_sets += [set(r["a"]) for r in db.raw("MATCH (p:Pair) WHERE p.pair_id IN $ids AND p.avoid IS NOT NULL RETURN p.avoid AS a",
                                                   {"ids": waiting}) if r["a"]]
        rows = [r for r in _dedupe(db.run("Q11_local_repair_candidates", {"released": waiting})) if set(r["pairs"]) not in avoid_sets]
        names = ", ".join(f"{_city(p)} {p}" for p in waiting)
        if not rows:
            db.raw("MATCH (p:Pair) WHERE p.pair_id IN $ids SET p.needs_rematch = false, p.rematch_checked = timestamp()", {"ids": waiting})
            db.event(self.name, f"No new loop yet for {names}. They stay first in line for the next match.", "info")
            return []
        res = solve(_with_fallbacks(rows), _priority_bonus(), failure_aware=True)
        if not res["chosen"]:
            db.raw("MATCH (p:Pair) WHERE p.pair_id IN $ids SET p.needs_rematch = false, p.rematch_checked = timestamp()", {"ids": waiting})
            db.event(self.name, f"No loop for {names} is worth offering yet. They stay first in line.", "info")
            return []
        loops = _save(res["chosen"], f"rematch-{_id('R')}", "rematch", res)
        for l in loops:
            self.offer(l["loop_id"])
            db.event(self.name, f"Re-matched {', '.join(_city(p) + ' ' + p for p in l['pairs'] if p in waiting)} into {l['loop_id']} "
                                f"({_route(l['pairs'])}, expected {l['expected_tx']} of {len(l['pairs'])}). Offers sent.", "plan")
            decide(self.name, "rematch", f"{_route(l['pairs'])} for families released by a failed loop",
                   [("Loop", "loop_id", l["loop_id"])])
        matched = [p for l in loops for p in l["pairs"]]
        db.raw("MATCH (p:Pair) WHERE p.pair_id IN $ids SET p.needs_rematch = false, p.avoid = null", {"ids": matched})
        return loops


def _cand_json(c: Candidate | None) -> dict | None:
    if not c:
        return None
    return {"pairs": c.pairs, "probs": c.probs, "expected": round(c.expected, 2), "p_all": round(c.p_all, 2),
            "size": len(c.pairs), "route": _route(c.pairs), "has_fallback": bool(c.fallback)}


# ---------------------------------------------------------------- committee clerk and liaison

class CommitteeClerk:
    name = "Committee clerk"

    def readiness(self, loop_id: str) -> dict:
        rows = db.run("Q15_loop_committee_readiness", {"loop_id": loop_id})
        now = int(time.time() * 1000)
        target = config.hospitals()["approval_target_days"]
        out = []
        for r in rows:
            docs = publish.documents(r["pair_id"], r["hospital"])
            missing = [d["type"] for d in docs if d["status"] != "verified"]
            day = max(0, (now - (r["opened"] or now)) // DAY_MS) + 1
            out.append({**r, "documents": docs, "done": len(docs) - len(missing), "total": len(docs),
                        "missing": missing, "day": day, "target_days": target,
                        "days_left": max(0, ((r["due"] or now) - now) // DAY_MS)})
        chase = {r["p"]: r for r in db.raw("MATCH (p:Pair) WHERE p.pair_id IN $ids RETURN p.pair_id AS p, "
                                            "coalesce(p.chase_level, 0) AS level, p.chased_at AS at", {"ids": [x["pair_id"] for x in out]})}
        for x in out:
            x["chase_level"] = chase.get(x["pair_id"], {}).get("level", 0)
            x["chased_at"] = chase.get(x["pair_id"], {}).get("at")
        blocking = None
        incomplete = [x for x in out if x["missing"]]
        if incomplete:
            blocking = max(incomplete, key=lambda x: (len(x["missing"]), x["day"]))["pair_id"]
        return {"pairs": out, "blocking": blocking}

    LADDER = ["Hospital reminded", "Coordinator alerted", "Committee secretary notified"]

    def chase(self, loop_id: str, auto: bool = False, cooldown_ms: int = 120_000) -> dict | None:
        """Move the blocking pair one step up the ladder: remind the hospital, alert the coordinator
        (an open task), then warn the committee secretary that the 42-day target is at risk.
        The watch only climbs when the deadline is close and the last step had time to work."""
        r = self.readiness(loop_id)
        if not r["blocking"]:
            return None
        b = next(x for x in r["pairs"] if x["pair_id"] == r["blocking"])
        level, now = b["chase_level"], int(time.time() * 1000)
        if level >= 3:
            return None
        if auto:
            limit = [14, 3, 1][level]
            if b["days_left"] > limit or (b["chased_at"] and now - b["chased_at"] < cooldown_ms):
                return None
        missing = ", ".join(m.replace("_", " ") for m in b["missing"])
        level += 1
        db.raw("MATCH (p:Pair {pair_id: $p}) SET p.chase_level = $n, p.chased_at = $now", {"p": b["pair_id"], "n": level, "now": now})
        if level == 1:
            msg = f"Reminder sent to {b['city']}: {b['pair_id']} is missing {missing}. {loop_id} is blocked; {b['days_left']} days left."
        elif level == 2:
            msg = f"Escalated to the exchange coordinator: {b['pair_id']} ({b['city']}) still missing {missing} after a reminder. {loop_id} is blocked."
            exists = db.raw("MATCH (t:Task {kind: 'committee_escalation', status: 'open'})-[:ABOUT]->(:Loop {loop_id: $l}) RETURN t.task_id AS t LIMIT 1",
                            {"l": loop_id})
            if not exists:
                MatchingAgent()._task("committee_escalation", loop_id, {"loop_id": loop_id, "pair_id": b["pair_id"], "city": b["city"],
                                                                         "missing": b["missing"], "days_left": b["days_left"]})
        else:
            msg = f"Committee secretary notified: {loop_id} may miss the {b['target_days']}-day target ({b['pair_id']}, {b['city']}: {missing})."
        db.event(self.name, msg, "warn")
        decide(self.name, "chase", msg, [("Loop", "loop_id", loop_id)], pair_id=b["pair_id"])
        return {"loop_id": loop_id, "pair_id": b["pair_id"], "level": level, "step": self.LADDER[level - 1]}


def family_status(pair_id: str, lang: str = "en") -> dict:
    with db.track() as tr:
        rows = db.run("Q16_family_status", {"pair_id": pair_id})
    if not rows:
        return {"error": "unknown case"}
    s = rows[0]
    broken = db.raw("""MATCH (p:Pair {pair_id: $p})-[:IN_LOOP]->(old:Loop {status: 'broken'})-[:REPLACED_BY]->(new:Loop)
                       RETURN old.loop_id AS old, new.loop_id AS new""", {"p": pair_id})
    facts = {**s, "replaced": bool(broken)}
    return {"facts": facts, "message": narrate.family(facts, lang), "queries": tr.ran}

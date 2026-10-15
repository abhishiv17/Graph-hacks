"""Shared services every organ program uses: pair facts, evidence, committee checklists, planning timelines,
integrity checks and demo scenarios. The code here is the same for kidney and liver; what differs comes from the
organ module (swapnet/organs) and its `program` block in data/params.

Evidence is assembled only from facts the graph returns (edge reasons, test results, failures, decisions). Nothing
here, or in any language model, creates a clinical fact. Every recommendation ends at a human review step.
"""
import json
import time

from swapnet import organs
from swapnet.agents import core
from swapnet.graph import db

DAY_MS = 86_400_000
ACTIVE = ["selected", "offered", "testing", "committee", "locked", "broken"]
STATUSES = ["ELIGIBLE", "REVIEW_REQUIRED", "UNKNOWN", "INELIGIBLE"]


def check_organ(organ: str | None) -> str | None:
    """None (every program) or a registered organ name; anything else is an error, never a silent fallback."""
    if organ in (None, "", "all"):
        return None
    organ = organ.lower()
    if organ not in organs.ORGANS:
        raise KeyError(f"unknown program {organ!r}; expected one of {organs.names()}")
    return organ


# ---------- pairs ----------

def pairs(organ: str | None = None, ids: list[str] | None = None) -> list[dict]:
    """Shared exchange facts per pair (Q25), plus the program's derived columns."""
    organ = check_organ(organ)
    rows = db.run("Q25_program_pairs", {"organ": organ, "ids": ids, "active": ACTIVE})
    links = {(c["pair_id"], c["dir"]): c["n"] for c in db.run("Q31_pair_link_counts", {"organ": organ})}
    for r in rows:
        r["gives_to"] = links.get((r["pair_id"], "gives_to"), 0)
        r["receives_from"] = links.get((r["pair_id"], "receives_from"), 0)
        tests = r.pop("tests") or []
        if r["organ"] == "liver":
            r["graft_suitability"] = {"ct": "ELIGIBLE", "estimate": "REVIEW_REQUIRED"}.get(r["volumetry"], "UNKNOWN")
            for k in ("anatomy_review", "donor_evaluation", "recipient_evaluation", "surgical_review"):
                r[k] = r[k] or "UNKNOWN"
        else:
            r["crossmatch"] = ("positive" if "positive" in tests else "negative" if "negative" in tests
                               else "pending" if "pending" in tests else "not requested")
            r["hla_typing"] = "complete" if not r["untyped_loci"] else "untyped " + ", ".join(r["untyped_loci"])
    return rows


# ---------- evidence ----------

def _approval(loop: dict, task: dict | None) -> dict:
    """Where this loop stands at its human review step."""
    if task:
        return {"status": "PENDING", "step": "repair approval", "task_id": task["task_id"],
                "note": "A coordinator must approve, choose the fallback, or decline."}
    if loop.get("replaces"):
        d = loop.get("approval")
        return {"status": "APPROVED", "step": "repair approval", "by": d and d["by"],
                "note": f"Approved by a person before {loop['loop_id']} replaced {loop['replaces']}."}
    if loop["status"] == "locked":
        return {"status": "APPROVED", "step": "committee approval", "note": "Every family approved by the Authorisation Committee."}
    if loop["status"] == "broken":
        return {"status": "NOT_APPLICABLE", "step": "none", "note": "This loop broke; see the repair proposal."}
    return {"status": "PENDING", "step": "committee approval",
            "note": "The Authorisation Committee approves every family before surgery."}


def evidence(loop_id: str) -> dict:
    """Traceable evidence for each link of a loop and for any repair proposal on it."""
    rows = db.run("Q26_loop_evidence", {"loop_id": loop_id})
    if not rows:
        raise KeyError(f"no loop {loop_id}")
    meta = db.raw("""MATCH (l:Loop {loop_id: $l})
                     OPTIONAL MATCH (o:Loop)-[:REPLACED_BY]->(l)
                     OPTIONAL MATCH (d:Decision)-[:BASED_ON]->(o) WHERE d.action IN ['approve_repair', 'use_fallback']
                     OPTIONAL MATCH (d)-[:APPROVED_BY]->(g:Agent)
                     OPTIONAL MATCH (t:Task {status: 'open'})-[:ABOUT]->(l) WHERE t.kind IN ['approve_repair', 'escalate']
                     RETURN l.loop_id AS loop_id, l.organ AS organ, l.status AS status, o.loop_id AS replaces,
                            g.name AS approved_by, t.task_id AS task_id, t.payload AS payload""", {"l": loop_id})[0]
    org = organs.get(meta["organ"])
    task = {"task_id": meta["task_id"], **json.loads(meta["payload"])} if meta["task_id"] else None
    loop = {"loop_id": loop_id, "status": meta["status"], "replaces": meta["replaces"],
            "approval": {"by": meta["approved_by"]} if meta["approved_by"] else None}
    approval = _approval(loop, task)
    links = []
    for r in rows:
        done, flags = org.constraints(r) if r["edge_status"] == "live" else ([], [])
        links.append({
            "recommendation_id": f"REC-{loop_id}-{r['pos'] + 1}",
            "organ": r["loop_organ"],
            "candidate_edge": f"{r['from_pair']} → {r['to_pair']}",
            "from_pair": r["from_pair"], "to_pair": r["to_pair"],
            "facts": r["reasons"] or [],
            "constraints_satisfied": done,
            "flags": flags,
            "p_success": r["p_success"],
            "test": {"kind": r["test_kind"], "name": org.test_name, "id": r["test_id"],
                     "result": r["test_result"] or ("passed" if r["test_passed"] else "not requested"), "finding": r["finding"]},
            "failure": {"cause": r["failed_cause"], "detail": r["failed_detail"]} if r["failed_cause"] else None,
            "edge_status": r["edge_status"] or "missing",
            "human_approval": approval,
        })
    organs_seen = {r["loop_organ"]} | {r["donor_organ"] for r in rows} | {r["patient_organ"] for r in rows} \
        | {r["edge_organ"] for r in rows if r["edge_organ"]}
    proposal = None
    if task and task.get("recommended"):
        rec = task["recommended"]
        proposal = {"recommendation_id": f"REC-{task['task_id']}", "organ": meta["organ"], "pairs": rec["pairs"],
                    "route": rec["route"], "facts": task.get("why", []), "expected": rec["expected"],
                    "fallback": task.get("fallback"),
                    "human_approval": {"status": "PENDING", "step": "repair approval", "task_id": task["task_id"]}}
    return {"loop_id": loop_id, "organ": meta["organ"], "exchange_label": org.program()["exchange_label"],
            "organ_isolated": organs_seen == {meta["organ"]}, "links": links, "proposal": proposal,
            "rules": org.rules(),
            "source": "Facts are read from CAN_GIVE_TO edges, Crossmatch, Failure, Decision and Task nodes (Q26_loop_evidence). "
                      "No fact is generated by a language model."}


# ---------- committee checklist ----------

def checklist(loop_id: str, organ: str, readiness: dict | None = None, ev: dict | None = None) -> dict:
    """The organ's committee checklist (program.committee_review), evaluated for one loop."""
    org = organs.get(organ)
    readiness = readiness or core.CommitteeClerk().readiness(loop_id)
    ev = ev or evidence(loop_id)
    fams = readiness["pairs"]
    facts = {r["pair_id"]: r for r in pairs(organ, [f["pair_id"] for f in fams])}
    items = []
    for item in org.program()["committee_review"]:
        kind, open_ = item["kind"], []
        if kind == "documents":
            for f in fams:
                docs = {d["type"]: d["status"] for d in f["documents"]}
                miss = [d for d in item["documents"] if docs.get(d) != "verified"]
                if miss:
                    open_.append(f"{f['pair_id']}: {', '.join(m.replace('_', ' ') for m in miss)}")
        elif kind == "compatibility":
            open_ = [l["candidate_edge"] for l in ev["links"] if l["edge_status"] != "live" or not l["facts"]]
        elif kind == "link_tests":
            open_ = [f"{l['candidate_edge']}: {l['test']['result']}" for l in ev["links"]
                     if l["test"]["result"] not in ("negative", "passed")]
        elif kind == "status":
            open_ = [f"{pid}: {((facts.get(pid) or {}).get(item['field']) or 'UNKNOWN').replace('_', ' ').lower()}" for pid in [f["pair_id"] for f in fams]
                     if (facts.get(pid) or {}).get(item["field"]) != "ELIGIBLE"]
        items.append({"key": item["key"], "label": item["label"], "kind": kind, "done": not open_, "open": open_})
    done = sum(1 for i in items if i["done"])
    return {"organ": organ, "items": items, "done": done, "total": len(items),
            "readiness_pct": round(100 * done / len(items)) if items else 0}


# ---------- planning timeline ----------

def timeline(loop: dict) -> dict:
    """Proposed planning steps for a loop, from its program's timeline. Synthetic dates: nothing is scheduled."""
    org = organs.get(loop.get("organ"))
    steps = org.program()["timeline"]
    start = loop.get("created_at") or int(time.time() * 1000)
    # Steps already behind the loop, by its status: offers, then the tests (and any review), then the committee.
    status = loop.get("status", "selected")
    committee = next(i for i, s in enumerate(steps) if s["key"] == "committee")
    done_through = {"testing": 1, "committee": committee, "locked": committee + 1}.get(status, 0)
    out = []
    for i, s in enumerate(steps):
        state = "done" if i < done_through else "current" if i == done_through and status != "broken" else "upcoming"
        out.append({"key": s["key"], "label": s["label"], "proposed_date": start + s["days"] * DAY_MS, "days": s["days"],
                    "state": "paused" if status == "broken" and i >= done_through else state})
    return {"organ": org.name, "steps": out, "synthetic": True,
            "note": "Proposed planning dates from the program configuration. Nothing here is a scheduled surgery."}


# ---------- integrity ----------

def integrity(organ: str | None = None) -> dict:
    """Shared and program-specific workflow checks. Findings are data-completeness issues, never diagnoses."""
    organ = check_organ(organ)
    with db.track() as tr:
        rows = db.run("Q27_integrity_shared", {"organ": organ, "active": ACTIVE})
        shared = [{**r, "scope": "shared"} for r in rows]
        specific = []
        for name in ([organ] if organ else organs.names()):
            org = organs.get(name)
            specific += [{**r, "scope": name} for r in db.run(org.integrity_query, {"active": ACTIVE})]
            # Committee-stage loops must meet their own program's checklist.
            for l in db.raw("MATCH (l:Loop {organ: $o}) WHERE l.status IN ['committee', 'locked'] RETURN l.loop_id AS id",
                            {"o": name}):
                c = checklist(l["id"], name)
                for item in c["items"]:
                    if not item["done"] and item["kind"] != "documents":
                        specific.append({"check": f"committee_{item['key']}", "severity": "warn", "ref": l["id"], "organ": name,
                                         "detail": f"{item['label']} not complete: {'; '.join(item['open'][:3])}", "scope": name})
    findings = shared + specific
    order = {"error": 0, "warn": 1, "info": 2}
    findings.sort(key=lambda f: (order.get(f["severity"], 3), f["scope"], f["ref"]))
    return {"organ": organ, "findings": findings,
            "counts": {s: sum(1 for f in findings if f["severity"] == s) for s in ("error", "warn", "info")},
            "checks": {"shared": "Q27_integrity_shared", **{n: organs.get(n).integrity_query for n in organs.names()}},
            "note": "Workflow and data-completeness checks. They never diagnose or judge a patient.", "queries": tr.ran}


# ---------- programs and scenarios ----------

def scenario(organ: str) -> dict:
    """The program's demo scenario (program.scenario) and where its story loop stands in the live graph."""
    org = organs.get(check_organ(organ))
    p = org.program()
    story = p["story"]["pairs"]
    loops = db.raw("""MATCH (:Pair {pair_id: $p})-[:IN_LOOP]->(l:Loop) WHERE l.status <> 'fallback'
                      RETURN l.loop_id AS loop_id, l.status AS status ORDER BY l.created_at""", {"p": story[0]})
    first = loops[0] if loops else None
    last = loops[-1] if loops else None
    return {"organ": org.name, **p["scenario"], "story_pairs": story, "family_pair": p["story"]["family_pair"],
            "story_loop": first and first["loop_id"], "story_status": first and first["status"],
            "repaired_into": last["loop_id"] if last and first and last["loop_id"] != first["loop_id"] else None,
            "synthetic": True}


def program(organ: str) -> dict:
    org = organs.get(check_organ(organ))
    p = org.program()
    return {"organ": org.name, "label": p["label"], "title": p["title"], "exchange_label": p["exchange_label"],
            "loop_prefix": org.prefix, "test_name": org.test_name, "hospitals": org.hospitals(),
            "rules": org.rules(), "committee_review": p["committee_review"], "timeline": p["timeline"],
            "scenario": p["scenario"], "story": p["story"],
            "statuses": STATUSES if org.name == "liver" else [],
            "note": "Program configuration for a software demonstration. Not clinical guidance."}

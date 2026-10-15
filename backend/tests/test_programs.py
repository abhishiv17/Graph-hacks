"""Multi-organ platform: programs never mix, each has its own rules, checklist, timeline and scenario, evidence is
traceable, and access is scoped by program and hospital. Needs a running FalkorDB (docker compose up falkordb)."""
import pytest
from fastapi.testclient import TestClient

from swapnet import organs, programs
from swapnet.api.main import app
from swapnet.graph import db
from swapnet.organs.base import OrganMismatch

c = TestClient(app)


@pytest.fixture(scope="module", autouse=True)
def fresh_demo():
    assert c.post("/api/demo/reset").json()["ok"]


# ---------- organ isolation at the matching layer ----------

def test_no_link_crosses_organs():
    assert db.raw("MATCH (a:Pair)-[e:CAN_GIVE_TO]->(b:Pair) WHERE a.organ <> b.organ RETURN count(e) AS n")[0]["n"] == 0
    # Every edge says which program built it, and it is its pairs' program.
    rows = db.raw("MATCH (a:Pair)-[e:CAN_GIVE_TO]->(b:Pair) RETURN DISTINCT a.organ AS a, e.organ AS e, b.organ AS b")
    assert rows and all(r["a"] == r["e"] == r["b"] for r in rows)


def test_kidney_and_liver_pairs_that_fit_by_blood_group_still_never_link():
    # A kidney donor of blood group O fits every patient by ABO; no liver patient may get a link from it.
    rows = db.raw("""MATCH (k:Pair {organ: 'kidney'})-[:HAS_DONOR]->(:Donor {abo: 'O'}), (l:Pair {organ: 'liver'})
                     OPTIONAL MATCH (k)-[e:CAN_GIVE_TO]-(l) RETURN count(e) AS n, count(*) AS pairs""")
    assert rows[0]["pairs"] > 0 and rows[0]["n"] == 0


def test_an_organ_rule_refuses_another_organs_pair():
    with pytest.raises(OrganMismatch):
        organs.get("kidney").build_edges("P-0412")      # a liver pair
    with pytest.raises(OrganMismatch):
        organs.get("liver").build_edges("P-0154")       # a kidney pair


def test_loop_queries_stay_inside_one_program():
    checked = 0
    # Ask for each program among every pair (not only waiting ones), so both organs return loops.
    db.raw("MATCH (p:Pair) SET p.status_was = p.status, p.status = 'waiting'")
    try:
        for organ in organs.names():
            rows = db.run("Q04_two_way_loops", {"ids": None, "organ": organ}) + db.run("Q05_three_way_loops", {"ids": None, "organ": organ})
            seen = {r["o"] for r in db.raw("MATCH (p:Pair) WHERE p.pair_id IN $ids RETURN DISTINCT p.organ AS o",
                                             {"ids": [p for r in rows for p in r["pairs"]]})}
            assert seen == {organ}
            checked += len(rows)
    finally:
        db.raw("MATCH (p:Pair) SET p.status = p.status_was REMOVE p.status_was")
    assert checked > 0
    for l in c.get("/api/exchanges").json():
        assert l["loop_id"].startswith(organs.get(l["organ"]).prefix)


def test_candidates_need_the_pairs_own_organ():
    assert c.get("/api/matches", params={"organ": "kidney", "pair_id": "P-0412"}).status_code == 404
    ok = c.get("/api/matches", params={"organ": "liver", "pair_id": "P-0412"}).json()
    liver = {r["pair_id"] for r in programs.pairs("liver")}
    assert ok["gives"] and all(g["to_pair"] in liver for g in ok["gives"])
    assert c.get("/api/pairs", params={"organ": "heart"}).status_code == 400


# ---------- programs: own data, rules, checklist, timeline, scenario ----------

def test_programs_have_their_own_configuration():
    progs = {p["organ"]: p for p in c.get("/api/programs").json()}
    assert set(progs) == {"kidney", "liver"}
    k, l = progs["kidney"], progs["liver"]
    assert {r["code"] for r in k["rules"]} >= {"BLOOD_COMPATIBILITY", "VIRTUAL_CROSSMATCH_CLEAR"}
    assert {r["code"] for r in l["rules"]} >= {"BLOOD_COMPATIBILITY", "GRAFT_SIZE", "ANATOMY_NOT_INELIGIBLE"}
    assert "VIRTUAL_CROSSMATCH_CLEAR" not in {r["code"] for r in l["rules"]}
    assert {i["key"] for i in k["committee_review"]} != {i["key"] for i in l["committee_review"]}
    assert "anatomy" in {i["key"] for i in l["committee_review"]} and "hla" in {i["key"] for i in k["committee_review"]}
    assert l["statuses"] == ["ELIGIBLE", "REVIEW_REQUIRED", "UNKNOWN", "INELIGIBLE"]


def test_pair_facts_follow_the_program():
    k = c.get("/api/pairs", params={"organ": "kidney"}).json()["pairs"]
    l = c.get("/api/pairs", params={"organ": "liver"}).json()["pairs"]
    assert {r["organ"] for r in k} == {"kidney"} and {r["organ"] for r in l} == {"liver"}
    assert "crossmatch" in k[0] and "graft_suitability" not in k[0]
    assert "graft_suitability" in l[0] and "crossmatch" not in l[0]
    assert all(r[f] in programs.STATUSES for r in l for f in ("anatomy_review", "donor_evaluation", "recipient_evaluation", "surgical_review"))
    # Shared view carries no identities.
    assert not any("name" in r or "patient" in r for r in k + l)


def test_ineligible_liver_donors_get_no_links():
    n = db.raw("""MATCH (p:Pair {organ: 'liver'})-[:HAS_DONOR]->(:Donor)-[:HAS_LIVER]->(lv:LiverProfile)
                  WHERE lv.anatomy_review = 'INELIGIBLE' OR lv.donor_evaluation = 'INELIGIBLE'
                  OPTIONAL MATCH (p)-[e:CAN_GIVE_TO]->() RETURN count(DISTINCT p) AS donors, count(e) AS links""")[0]
    assert n["donors"] > 0 and n["links"] == 0


def test_loop_detail_carries_evidence_checklist_and_timeline():
    k = c.get("/api/loops/S-0076").json()
    l = c.get("/api/loops/L-0034").json()
    assert k["exchange_label"] == "Kidney exchange" and l["exchange_label"] == "Liver exchange"
    assert {i["key"] for i in l["checklist"]["items"]} >= {"anatomy", "surgical", "tests"}
    surgical = next(i for i in l["checklist"]["items"] if i["key"] == "surgical")
    assert not surgical["done"] and any("P-0433" in x for x in surgical["open"])   # Chennai's review is still open
    assert [s["key"] for s in l["timeline"]["steps"]][:3] == ["offers", "workup", "review"]
    assert l["timeline"]["synthetic"] is True


def test_evidence_is_read_from_the_graph():
    ev = c.get("/api/loops/L-0034/evidence").json()
    assert ev["organ"] == "liver" and ev["organ_isolated"]
    first = ev["links"][0]
    assert {"ORGAN_TYPE", "BLOOD_COMPATIBILITY", "GRAFT_SIZE"} <= set(first["constraints_satisfied"])
    assert first["facts"] and first["human_approval"]["status"] == "PENDING"
    edge = db.raw("MATCH (:Pair {pair_id: $a})-[e:CAN_GIVE_TO]->(:Pair {pair_id: $b}) RETURN e.reasons AS r",
                  {"a": first["from_pair"], "b": first["to_pair"]})[0]["r"]
    assert first["facts"] == edge
    kev = c.get("/api/loops/S-0076/evidence").json()
    assert "VIRTUAL_CROSSMATCH_CLEAR" in kev["links"][0]["constraints_satisfied"]
    assert "GRAFT_SIZE" not in kev["links"][0]["constraints_satisfied"]


def test_scenarios_one_per_program():
    sims = {s["organ"]: s for s in c.get("/api/simulations").json()}
    assert sims["kidney"]["story_loop"].startswith("S-") and sims["liver"]["story_loop"].startswith("L-")
    for s in sims.values():
        assert s["initial_state"] and s["failure_event"] and s["repair_strategy"] and s["expected_review_step"]
    assert "Synthetic demonstration rule" in sims["liver"]["failure_event"]


# ---------- integrity and audit ----------

def test_integrity_has_no_errors_on_a_fresh_demo_and_stays_in_program():
    allf = c.get("/api/integrity").json()
    assert allf["counts"]["error"] == 0
    liver = c.get("/api/integrity", params={"organ": "liver"}).json()["findings"]
    assert liver and all(f["organ"] == "liver" for f in liver)
    assert {f["check"] for f in liver} <= {"donor_review_open", "recipient_review_open", "awaiting_human_review",
                                           "graft_suitability_unconfirmed", "missing_liver_profile"} | {f["check"] for f in liver if f["check"].startswith("committee_")}


def test_audit_is_tagged_by_program():
    liver = c.get("/api/audit", params={"organ": "liver"}).json()
    assert liver and all(e["organ"] in ("liver", "shared") for e in liver)
    assert not any("P-0154" in e["text"] for e in liver)        # a kidney family


# ---------- access ----------

def test_access_is_scoped_by_program_and_hospital():
    h = {"X-KindRed-User": "che_liver"}
    me = c.get("/api/me", headers=h).json()
    assert me["programs"] == ["liver"] and me["authenticated"] is False
    rows = c.get("/api/pairs", headers=h).json()["pairs"]
    assert rows and all(r["organ"] == "liver" and r["code"] == "CHE" for r in rows)
    assert c.get("/api/pairs", params={"organ": "kidney"}, headers=h).status_code == 403
    assert c.post("/api/loops/S-0076/lab", headers=h).status_code == 403          # kidney loop, other hospitals
    assert c.post("/api/loops/L-0034/lab", headers=h).status_code == 403          # liver, but Delhi and Kochi too


def test_read_only_users_cannot_approve():
    task = c.post("/api/loops/L-0034/lab").json()          # default identity: platform admin
    pool = c.get("/api/pool").json()
    tid = next(t["task_id"] for t in pool["open_tasks"] if t["loop_id"] == "L-0034")
    r = c.post(f"/api/tasks/{tid}/approve", json={"choice": "recommended"}, headers={"X-KindRed-User": "observer"})
    assert r.status_code == 403
    assert task["results"]

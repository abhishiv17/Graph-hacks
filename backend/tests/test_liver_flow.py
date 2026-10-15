"""End-to-end for the liver module: the same engine, a different edge rule and test. Delhi -> Chennai -> Kochi
fails its donor work-up (Chennai's CT measures a lobe smaller than the estimate) and the repair keeps
Delhi <-> Chennai. Needs a running FalkorDB (docker compose up falkordb)."""
from fastapi.testclient import TestClient

from swapnet.api.main import app

c = TestClient(app)
TRIO = {"P-0412", "P-0433", "P-0451"}


def test_liver_workup_fails_and_repairs():
    assert c.post("/api/demo/reset").json()["ok"]
    pool = c.get("/api/pool").json()
    main = next(l for l in pool["loops"] if {p["pair_id"] for p in l["pairs"]} == TRIO)
    loop_id = main["loop_id"]
    assert main["organ"] == "liver" and loop_id.startswith("L-")
    assert pool["by_organ"]["liver"]["loops"] >= 1 and pool["by_organ"]["kidney"]["loops"] >= 1

    # Loops never mix organs.
    pair_organ = {p["pair_id"]: p["organ"] for h in ("DEL", "CHE", "COK") for p in c.get(f"/api/hospital/{h}").json()["pairs"]}
    for l in pool["loops"]:
        assert {pair_organ.get(p["pair_id"], l["organ"]) for p in l["pairs"]} == {l["organ"]}

    res = c.post(f"/api/loops/{loop_id}/lab").json()["results"]
    assert res[0]["result"] == "negative"
    bad = res[-1]
    assert (bad["a"], bad["b"]) == ("P-0433", "P-0451") and bad["result"] == "positive"
    assert bad["antibody"].startswith("GRWR 0.7")

    d = c.get(f"/api/loops/{loop_id}").json()
    assert d["loop"]["status"] == "broken"
    assert next(w for w in d["workflow"] if w["from_pair"] == "P-0433")["test_kind"] == "volumetry"
    prop = d["proposal"]
    assert prop["kind"] == "approve_repair"
    assert set(prop["recommended"]["pairs"]) == {"P-0412", "P-0433"}

    # The work-up taught the pool Chennai's measured volume, and the link to Kochi is remembered as failed.
    from swapnet.graph import db
    lv = db.raw("MATCH (:Pair {pair_id: 'P-0433'})-[:HAS_DONOR]->(:Donor)-[:HAS_LIVER]->(lv:LiverProfile) RETURN lv.volumetry AS v")
    assert lv[0]["v"] == "ct"
    f = db.raw("MATCH (:Pair {pair_id: 'P-0433'})-[f:FAILED]->(:Pair {pair_id: 'P-0451'}) RETURN f.cause AS c")
    assert f and f[0]["c"] == "graft_too_small"
    assert not db.raw("MATCH (:Pair {pair_id: 'P-0433'})-[e:CAN_GIVE_TO {status: 'live'}]->(:Pair {pair_id: 'P-0451'}) RETURN e")

    fam = c.get("/api/family/P-0451").json()
    assert "liver" in fam["message"]["body"]

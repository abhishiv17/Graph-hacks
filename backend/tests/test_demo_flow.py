"""End-to-end: load the demo, break S-0031's Bengaluru -> Kolkata link in the lab, repair it.
Needs a running FalkorDB (docker compose up falkordb)."""
from fastapi.testclient import TestClient

from swapnet.api.main import app

c = TestClient(app)


def test_break_and_repair():
    r = c.post("/api/demo/reset").json()
    assert r["ok"]
    pool = c.get("/api/pool").json()
    main = next(l for l in pool["loops"] if {p["pair_id"] for p in l["pairs"]} == {"P-0154", "P-0211", "P-0388"})
    loop_id = main["loop_id"]
    assert main["has_fallback"]

    # Nobody could be matched inside their own hospital.
    assert c.get("/api/hospital/HYD").json()["loops_alone"] == 0

    assert c.post("/api/demo/add-chennai").json()["published"]
    res = c.post(f"/api/loops/{loop_id}/lab").json()["results"]
    assert res[-1]["result"] == "positive" and res[-1]["antibody"] == "DQ7"

    d = c.get(f"/api/loops/{loop_id}").json()
    assert d["loop"]["status"] == "broken"
    prop = d["proposal"]
    assert prop["kind"] == "approve_repair"
    assert prop["recommended"]["pairs"] == ["P-0154", "P-0211", "P-0377"]
    assert prop["fallback"]["pairs"] == ["P-0154", "P-0211"]

    new = c.post(f"/api/tasks/{prop['task_id']}/approve", json={"choice": "recommended"}).json()
    d2 = c.get(f"/api/loops/{new['loop_id']}").json()
    first = d2["workflow"][0]
    assert first["result"] == "negative"           # the Hyderabad -> Bengaluru test carried over
    assert d2["committee"]["blocking"] == "P-0377"  # Chennai's file is the slowest
    actions = [x["action"] for x in d2["decisions"]]
    assert "approve_repair" in actions and "propose_repair" in actions

    fam = c.get("/api/family/P-0154").json()
    assert fam["facts"]["families"] == 3
    assert "new family" in fam["message"]["body"]


def test_failed_link_is_never_proposed_again():
    from swapnet.graph import db
    rows = db.run("Q04_two_way_loops", {"ids": ["P-0388"], "organ": None}) + db.run("Q05_three_way_loops", {"ids": ["P-0388"], "organ": None})
    for r in rows:
        ps = r["pairs"]
        for i, a in enumerate(ps):
            assert not (a == "P-0211" and ps[(i + 1) % len(ps)] == "P-0388")

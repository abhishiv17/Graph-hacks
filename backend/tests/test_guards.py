"""Guards: ids are checked against the graph, and a broken loop takes no more lab work.
Needs a running FalkorDB (docker compose up falkordb)."""
from fastapi.testclient import TestClient

from swapnet.api.main import app
from swapnet.mcp import server

c = TestClient(app)


def _break_s0076() -> tuple[str, dict]:
    c.post("/api/demo/reset")
    c.post("/api/demo/add-chennai")
    c.post("/api/loops/S-0076/lab")
    return "S-0076", c.get("/api/loops/S-0076").json()


def test_broken_loop_gets_no_more_tests_and_no_odds():
    loop_id, d = _break_s0076()
    assert d["loop"]["status"] == "broken"
    assert d["loop"]["p_success"] == 0 and d["loop"]["expected_tx"] == 0
    results = [w["result"] for w in d["workflow"]]
    assert results.count("positive") == 1 and "pending" not in results
    assert "cancelled" in results                     # the third test was never sent

    r = c.post(f"/api/loops/{loop_id}/lab")
    assert r.status_code == 409 and "broken" in r.json()["detail"]
    assert "broken" in server.run_lab_tests(loop_id)["error"]


def test_unknown_ids_are_not_answered_as_empty_results():
    assert c.get("/api/hospital/XYZ").status_code == 404
    assert c.post("/api/tasks/T-nope/approve", json={"choice": "recommended"}).status_code == 404
    assert c.post("/api/tasks/T-nope/decline", json={"reason": "x"}).status_code == 404
    assert c.post("/api/loops/S-9999/lab").status_code == 404
    assert "S-9999" in server.explain("S-9999")["error"]
    assert "P-9999" in server.patient_status("P-9999")["error"]
    assert "P-9999" in server.virtual_crossmatch("P-0154", "P-9999")["error"]


def test_approve_checks_the_choice_and_the_task_state():
    _, d = _break_s0076()
    tid = d["proposal"]["task_id"]
    bad = c.post(f"/api/tasks/{tid}/approve", json={"choice": "zzz"})
    assert bad.status_code == 400 and "unknown choice" in bad.json()["detail"]
    assert c.post(f"/api/tasks/{tid}/approve", json={"choice": "alt:9"}).status_code == 400
    assert c.post(f"/api/tasks/{tid}/approve", json={"choice": "recommended"}).status_code == 200
    again = c.post(f"/api/tasks/{tid}/approve", json={"choice": "recommended"})
    assert again.status_code == 409 and "done" in again.json()["detail"]
    c.post("/api/demo/reset")

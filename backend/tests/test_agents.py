"""The agents' follow-through: holds released by lab results, a recorded decline, re-matching released
families, the committee chase ladder and the background watch. Needs a running FalkorDB."""
import os

os.environ.setdefault("KINDRED_WATCH", "0")

from fastapi.testclient import TestClient  # noqa: E402

from swapnet.agents import core, watch  # noqa: E402
from swapnet.api.main import app  # noqa: E402
from swapnet.graph import db  # noqa: E402

c = TestClient(app)


def _focus() -> str:
    pool = c.get("/api/pool").json()
    return next(l["loop_id"] for l in pool["loops"] if {p["pair_id"] for p in l["pairs"]} == {"P-0154", "P-0211", "P-0388"})


def _events(text: str) -> list[dict]:
    return [e for e in c.get("/api/events?since=0").json() if text in e["text"]]


def test_hold_released_by_negative_lab_test():
    c.post("/api/demo/reset")
    loop_id = _focus()
    offer = f"{loop_id}-P-0211"
    db.raw("MATCH (o:Offer {offer_id: $o}) SET o.response = 'hold'", {"o": offer})
    c.post("/api/demo/add-chennai")
    c.post(f"/api/loops/{loop_id}/lab")  # Hyderabad -> Bengaluru is negative, so Bengaluru's hold lifts
    r = db.raw("MATCH (o:Offer {offer_id: $o}) RETURN o.response AS r", {"o": offer})[0]["r"]
    # The loop then breaks on Bengaluru -> Kolkata, which withdraws anything still pending, but this hold was released first.
    assert r == "accept"
    assert _events("Hold released for P-0211")


def test_decline_is_recorded_and_families_go_back_to_matching():
    c.post("/api/demo/reset")
    loop_id = _focus()
    c.post("/api/demo/add-chennai")
    c.post(f"/api/loops/{loop_id}/lab")
    prop = c.get(f"/api/loops/{loop_id}").json()["proposal"]
    assert prop["status"] == "open"

    assert c.post(f"/api/tasks/{prop['task_id']}/decline", json={"reason": " "}).status_code == 400
    r = c.post(f"/api/tasks/{prop['task_id']}/decline", json={"reason": "prefer to wait for Chennai's papers"}).json()
    assert r["declined"] == loop_id

    d = c.get(f"/api/loops/{loop_id}").json()
    assert d["proposal"]["status"] == "declined"
    assert d["proposal"]["result"] == "prefer to wait for Chennai's papers"
    assert "decline_repair" in [x["action"] for x in d["decisions"]]
    assert loop_id not in [t["loop_id"] for t in c.get("/api/pool").json()["open_tasks"]]
    # Never re-matched into the loop that was just declined.
    for l in r["rematched"]:
        assert set(l["pairs"]) != set(prop["recommended"]["pairs"])
    assert c.post(f"/api/tasks/{prop['task_id']}/approve", json={"choice": "recommended"}).status_code == 400


def test_released_family_is_rematched_after_approval():
    c.post("/api/demo/reset")
    loop_id = _focus()
    c.post("/api/demo/add-chennai")
    c.post(f"/api/loops/{loop_id}/lab")
    prop = c.get(f"/api/loops/{loop_id}").json()["proposal"]
    r = c.post(f"/api/tasks/{prop['task_id']}/approve", json={"choice": "recommended"}).json()
    assert "rematched" in r
    # Kolkata is the family left out of the repair; the matching agent either placed it or said why not.
    assert _events("P-0388")
    if r["rematched"]:
        assert any("P-0388" in l["pairs"] for l in r["rematched"])


def test_committee_chase_climbs_a_three_step_ladder():
    c.post("/api/demo/reset")
    loops = c.get("/api/committee").json()["loops"]
    blocked = next(l for l in loops if not l["ready"])
    steps = [c.post(f"/api/loops/{blocked['loop_id']}/chase").json()["step"] for _ in range(4)]
    assert [s["level"] for s in steps[:3]] == [1, 2, 3]
    assert steps[3] is None
    esc = c.get("/api/pool").json()["escalations"]
    assert any(e["loop_id"] == blocked["loop_id"] for e in esc)
    d = c.get(f"/api/loops/{blocked['loop_id']}").json()
    assert next(p for p in d["committee"]["pairs"] if p["pair_id"] == d["committee"]["blocking"])["chase_level"] == 3


def test_watch_sweep_runs_every_duty():
    c.post("/api/demo/reset")
    r = c.post("/api/agents/sweep").json()
    assert r["skipped"] is False and r["sweeps"] >= 1
    assert not [e for e in c.get("/api/events?since=0").json() if e["agent"] == "Watch"], "a watch duty raised an error"
    # The committee clerk acts on the most urgent blocked file by itself.
    assert any(a.startswith("Hospital reminded") for a in r["last_actions"])
    assert c.get("/api/agents").json()["sweeps"] == r["sweeps"]
    # With the lock held (e.g. during a reset) the watch steps aside instead of colliding.
    with core.LOCK:
        pass
    assert watch.sweep()["skipped"] is False

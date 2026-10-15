"""Demo patients (docs/personas.md): the health watch, its memory and the hand-offs. Needs a running FalkorDB; resets
the demo graph."""
import pytest
from fastapi.testclient import TestClient

from swapnet import personas, scenario
from swapnet.api.main import app
from swapnet.graph import db

c = TestClient(app)


@pytest.fixture(scope="module", autouse=True)
def _demo():
    scenario.load()


def test_personas_are_seeded_across_three_graphs():
    rows = c.get("/api/personas").json()
    assert {r["id"] for r in rows} == {"sunita", "rajesh"}
    j = c.get("/api/personas/sunita").json()
    assert len(j["readings"]) == 6 and j["stage"] == "watch"
    assert j["graphs"] == {"memory": "mem_sunita", "hospital": "hosp_hyd", "shared": "exchange"}
    # Clinical history stays private: no LabResult in the shared exchange graph.
    assert db.raw("MATCH (r:LabResult) RETURN count(r) AS n")[0]["n"] == 0
    assert {q["graph"] for q in j["queries"]} >= {"mem_sunita", "hosp_hyd", "exchange"}
    # Procedural memory is graph data: every stage has a playbook.
    assert db.raw("MATCH (pb:Playbook) RETURN count(pb) AS n", graph="mem_sunita")[0]["n"] == 3


def test_stage_change_hands_off_and_the_agents_form_a_swap():
    r = c.post("/api/personas/sunita/advance").json()
    f = r["finding"]
    assert (f["previous_stage"], f["stage"], f["kind"]) == ("watch", "prepare", "stage_change")
    assert len(f["tasks"]) == 5 and len(r["handoffs_run"]) == 5  # nobody waits for a person
    j = c.get("/api/personas/sunita").json()
    assert j["case"] and j["case"]["status"] in ("offered", "testing") and j["pair"]["urgent"] is True
    assert sum(1 for a in j["appointments"] if a["status"] == "booked") == 2
    assert not any(h["status"] == "open" for h in j["handoffs"])


def test_same_stage_no_repeat_and_the_case_moves_on():
    r = c.post("/api/personas/sunita/advance").json()
    assert r["finding"]["kind"] == "reading" and r["finding"]["tasks"] == []
    assert any("passed" in s for s in r["steps"])  # the crossmatch coordinator ran the tests on its own
    facts = {x["key"]: x for x in c.get("/api/personas/sunita").json()["facts"]}
    assert facts["trend"]["was_text"]  # the belief it replaced is kept (SUPERSEDES)


def test_sunita_reaches_a_transplant_without_a_click():
    for _ in range(4):
        r = c.post("/api/personas/sunita/advance")
        if r.status_code != 200:
            break
    j = c.get("/api/personas/sunita").json()
    assert j["transplanted"] and j["case"]["surgery_at"] and j["case"]["transplanted_at"]
    assert any(a["kind"] == "Transplant surgery" and a["status"] == "done" for a in j["appointments"])
    assert c.post("/api/personas/sunita/advance").status_code == 409
    # The swap stays on the live map.
    assert any(l["loop_id"] == j["case"]["loop_id"] for l in c.get("/api/pool").json()["loops"])


def test_session_greeting_comes_from_memory():
    g = c.post("/api/personas/sunita/session").json()["greeting"]
    assert "Since your last look" in g and "Prepare for transplant" in g and "latest:" in g
    # A second visit within a minute is the same session, not a new one.
    assert c.post("/api/personas/sunita/session").json()["reused"] is True


def test_liver_meld_updates_the_shared_exchange():
    c.post("/api/personas/rajesh/advance")
    meld = db.raw("MATCH (:Pair {pair_id: 'P-0902'})-[:HAS_PATIENT]->(t:Patient) RETURN t.meld AS m")[0]["m"]
    assert meld == personas.get("rajesh")["future"][0]


def test_rajesh_waits_until_a_new_family_joins_then_the_watch_finds_it():
    c.post("/api/personas/rajesh/reset")
    r = c.post("/api/personas/rajesh/advance").json()
    assert r["finding"]["stage"] == "prepare"
    assert not c.get("/api/personas/rajesh").json()["case"]  # nobody in the pool fits him yet
    r = c.post("/api/personas/rajesh/advance").json()
    assert any("joined the pool" in s for s in r["steps"]) and any("Found swap" in s for s in r["steps"])
    assert "P-0903" in c.get("/api/personas/rajesh").json()["case"]["pairs"]


def test_replay_undoes_the_swap_and_the_arrival():
    loop = c.get("/api/personas/rajesh").json()["case"]["loop_id"]
    c.post("/api/personas/rajesh/reset")
    j = c.get("/api/personas/rajesh").json()
    assert j["week"] == 0 and j["stage"] == "watch" and not j["handoffs"] and not j["case"]
    assert not db.raw("MATCH (l:Loop {loop_id: $l}) RETURN l", {"l": loop})
    assert not db.raw("MATCH (q:Pair {pair_id: 'P-0903'}) RETURN q")
    assert c.get("/api/personas/nobody").status_code == 404


def test_ask_tool_reads_patient_memory():
    from swapnet import access
    from swapnet.agents import ask
    box = ask.ToolBox(access.Viewer("meera", access.policy()["users"]["meera"]))
    m = box.patient_memory("Sunita's P-0901")
    assert m["followed"] and m["memory_graph"] == "mem_sunita" and any(b["about"] == "stage" for b in m["beliefs"])
    assert box.patient_memory("P-0154")["followed"] is False
    with pytest.raises(ask.NotInGraph):
        box.patient_memory("P-9999")

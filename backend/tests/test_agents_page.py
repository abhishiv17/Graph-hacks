"""The Agents page and Ask KindRed's example conversations, both read live from the graph. Needs a running FalkorDB;
resets the demo graph."""
import pytest
from fastapi.testclient import TestClient

from swapnet import access, scenario
from swapnet.agents import ask, examples, network
from swapnet.api.main import app

c = TestClient(app)


@pytest.fixture(scope="module", autouse=True)
def _demo():
    scenario.load()


def test_the_agent_graph_is_drawn_from_the_graph():
    g = network.build()
    ids = {n["id"] for n in g["nodes"]}
    assert {r["id"] for r in network.ROSTER} | {"exchange", "hospitals", "mem:sunita", "mem:rajesh"} <= ids
    # Every line joins two nodes on the page, and agents only ever meet through a graph or a task.
    kinds = {n["id"]: n["type"] for n in g["nodes"]}
    for e in g["edges"]:
        assert e["from"] in ids and e["to"] in ids and e["n"] > 0
        assert not (kinds[e["from"]] == "agent" and kinds[e["to"]] == "agent")
    intake = next(n for n in g["nodes"] if n["id"] == "intake")
    assert intake["decisions"] > 0 and len(intake["members"]) == 11
    assert {n["driver"] for n in g["nodes"] if n["type"] == "agent"} == {"model", "rules", "person"}
    assert g["feed"] and all(f["text"] for f in g["feed"])


def test_open_tasks_show_who_handed_what_to_whom():
    g = network.build()
    for t in [n for n in g["nodes"] if n["type"] == "task"]:
        assert any(e["from"] == t["from"] and e["to"] == t["id"] for e in g["edges"])
        assert any(e["from"] == t["id"] and e["to"] == t["to"] for e in g["edges"])
    assert c.get("/api/agents/graph").status_code == 200


def test_examples_are_answered_by_the_real_tools_with_every_id_checked():
    out = examples.build(access.viewer(None))
    assert len(out) >= 4
    tools = {t["name"] for t in ask.TOOLS}
    for x in out:
        r = x["r"]
        assert r["example"] and "no model" in r["model"] and r["trace"]
        assert all(t["tool"] in tools for t in r["trace"]) and r["unverified_ids"] == []
    by_q = {x["q"]: x["r"] for x in out}
    assert by_q["What happens if P-9999 withdraws?"]["trace"][0]["error"].startswith("not in the graph")
    assert any(t["tool"] == "match_ease" for r in by_q.values() for t in r["trace"])
    memory = next(r for q, r in by_q.items() if "remember" in q)
    assert memory["from_memory"] and all(m["at"] for m in memory["from_memory"])
    assert c.get("/api/ask/examples").json()["examples"]


def test_labs_answer_on_their_own_but_leave_the_story_swaps_for_a_person(monkeypatch):
    from swapnet.agents import watch
    from swapnet.graph import db
    testing = lambda: {r["l"] for r in db.raw("MATCH (l:Loop {status: 'testing'}) RETURN l.loop_id AS l")}
    story = {r["l"] for r in db.raw("MATCH (p:Pair)-[:IN_LOOP]->(l:Loop {status: 'testing'}) WHERE p.pair_id IN $k "
                                    "RETURN DISTINCT l.loop_id AS l", {"k": list(watch._story_pairs())})}
    assert story and testing() - story
    # Tests younger than the lab's turnaround stay pending.
    monkeypatch.setattr(watch, "LAB_SECONDS", 3600)
    assert watch._lab_returns() == []
    monkeypatch.setattr(watch, "LAB_SECONDS", 0)
    done = []
    while out := watch._lab_returns():
        done += out
    assert done and all(s.startswith("Lab results back for ") for s in done)
    assert not any(l in s for l in story for s in done)
    assert story <= testing()  # S-0076 and L-0034 still wait for Run lab tests


def test_search_summary_names_the_search_the_tool_ran():
    from swapnet.agents.coordinator import _summary

    class T:
        trace = [{"tool": "find_swaps", "error": None, "input": {"max_size": "2"}, "result": {"two_way": 3, "three_way": None}},
                 {"tool": "find_swaps", "error": None, "input": {"max_size": 3}, "result": {"two_way": 3, "three_way": 7}},
                 {"tool": "wait", "error": None, "input": {"reason": "nothing to do"}, "result": {}}]
    s = _summary(T(), None)
    assert "2-way search found 3" in s and "3-way search found 7" in s and "None" not in s


def test_run_a_week_and_autoplay_from_the_api():
    from swapnet.agents import watch
    r = c.post("/api/agents/autoplay", json={"on": True, "minutes": 5}).json()
    assert r["autoplay_until"] and c.get("/api/agents/graph").json()["watch"]["autoplay_until"] == r["autoplay_until"]
    assert c.post("/api/agents/autoplay", json={"on": False}).json() == {"autoplay_until": None}
    # The watch is paused for the test run, so a round is refused rather than racing the tests.
    assert c.post("/api/agents/run-week").status_code == 409
    assert not watch.state["busy"]

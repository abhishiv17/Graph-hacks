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

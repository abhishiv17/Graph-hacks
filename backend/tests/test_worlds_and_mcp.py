"""Private demo copies (one set of FalkorDB graphs per visitor), the advance lock, and the coordinator agent calling
its tools over MCP on KindRed's own MCP server. Needs a running FalkorDB; resets the shared demo graph."""
import pytest
from fastapi.testclient import TestClient

from swapnet import scenario, worlds
from swapnet.agents import mcp_client
from swapnet.api.main import app
from swapnet.graph import db

c = TestClient(app)


@pytest.fixture(scope="module", autouse=True)
def _demo():
    scenario.load()


@pytest.fixture(autouse=True)
def _no_model(monkeypatch):
    monkeypatch.setenv("KINDRED_ASK_PROVIDER", "groq")
    monkeypatch.setenv("GROQ_API_KEY", "")  # the rules choose; the calls still go over MCP


def test_mcp_catalogue_hides_what_the_caller_fills_in():
    tools = {t["name"]: t for t in mcp_client.client.catalogue("patient_", hidden=("persona", "world"))}
    assert {"find_swaps", "form_swap", "run_tests", "request_papers", "book_surgery", "wait"} <= set(tools)
    assert "persona" not in tools["find_swaps"]["input_schema"]["properties"]
    assert tools["run_tests"]["input_schema"]["required"] == ["loop_id", "reason"]


def test_coordinator_calls_its_tools_over_mcp():
    c.post("/api/personas/rajesh/reset")
    d = c.post("/api/personas/rajesh/advance?week=0").json()["decision"]
    assert d["via"] == "mcp" and d["trace"] and all(t["via"] == "mcp" for t in d["trace"])
    assert [t["input"].get("max_size") for t in d["trace"] if t["tool"] == "find_swaps"] == [2, 3]  # shallow, then deep


def test_stale_week_and_busy_journey_are_refused():
    week = c.get("/api/personas/rajesh").json()["week"]
    r = c.post(f"/api/personas/rajesh/advance?week={week - 1}")
    assert r.status_code == 409 and "moved on" in r.json()["detail"]


def test_a_private_copy_is_isolated_and_can_be_left():
    w = c.post("/api/worlds").json()["id"]
    try:
        h = {"X-KindRed-World": w}
        assert any(g.startswith(f"{w}__exchange") for g in db.db().list_graphs())
        before = c.get("/api/personas").json()
        r = c.post("/api/personas/sunita/advance?week=0", headers=h)
        assert r.status_code == 200 and r.json()["week"] == 1
        assert [p["week"] for p in c.get("/api/personas").json()] == [p["week"] for p in before]  # shared demo untouched
        assert next(p for p in c.get("/api/personas", headers=h).json() if p["id"] == "sunita")["week"] == 1
        assert c.get("/api/worlds/current", headers=h).json()["id"] == w
    finally:
        assert c.delete("/api/worlds/current", headers={"X-KindRed-World": w}).status_code == 200
    assert not any(g.startswith(f"{w}__") for g in db.db().list_graphs())
    assert c.get("/api/personas", headers={"X-KindRed-World": w}).status_code == 410
    assert c.get("/api/worlds/current").json()["shared"] is True

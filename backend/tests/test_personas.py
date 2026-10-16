"""Demo patients (docs/personas.md): the world, the health watch, the coordinator agent, memory and the patient chat.
Needs a running FalkorDB; resets the demo graph. No real model is called: the rules path runs by default, and the
coordinator and chat tests play the model's turns with a scripted Groq client."""
import json
from types import SimpleNamespace as NS

import pytest
from fastapi.testclient import TestClient

from swapnet import personas, scenario
from swapnet.agents import ask, coordinator
from swapnet.api.main import app
from swapnet.graph import db

c = TestClient(app)


@pytest.fixture(scope="module", autouse=True)
def _demo():
    scenario.load()


@pytest.fixture(autouse=True)
def _test_chat(monkeypatch):
    """Tests talk in their own chat graphs, never in the real conversations about the demo patients."""
    monkeypatch.setattr(personas, "chat_graph", lambda pid: f"test_chat_{pid}")
    yield
    for g in db.db().list_graphs():
        if g.startswith("test_chat_"):
            db.db().select_graph(g).delete()


@pytest.fixture(autouse=True)
def _no_model(monkeypatch):
    """Groq without a key: the coordinator falls back to the rules, deterministically."""
    monkeypatch.setenv("KINDRED_ASK_PROVIDER", "groq")
    monkeypatch.setenv("GROQ_API_KEY", "")


class FakeGroq:
    """Plays Groq's /chat/completions: returns the given assistant messages in order and records each request body."""

    def __init__(self, *messages):
        self.messages, self.bodies = list(messages), []

    def post(self, url, headers=None, json=None):
        self.bodies.append(json)
        msg = self.messages.pop(0)
        return NS(status_code=200, headers={}, raise_for_status=lambda: None,
                  json=lambda: {"choices": [{"message": msg, "finish_reason": "tool_calls" if msg.get("tool_calls") else "stop"}],
                                "usage": {"prompt_tokens": 10, "completion_tokens": 3}})


def _calls(*calls):
    return {"role": "assistant", "content": "", "tool_calls": [
        {"id": f"c{i}", "type": "function", "function": {"name": n, "arguments": json.dumps(a)}} for i, (n, a) in enumerate(calls)]}


def _scripted(monkeypatch, *messages) -> FakeGroq:
    http = FakeGroq(*messages)
    monkeypatch.setenv("GROQ_API_KEY", "test-key")
    monkeypatch.setattr(ask, "default_llm", lambda system=None, tools=None: ask.GroqLLM(key="test-key", http=http, system=system, tools=tools))
    return http


def test_personas_are_seeded_across_three_graphs():
    rows = c.get("/api/personas").json()
    assert {r["id"] for r in rows} == {"sunita", "rajesh"}
    j = c.get("/api/personas/sunita").json()
    assert len(j["readings"]) == 6 and j["stage"] == "watch" and not j["case"]
    # Six months on file, week by week: a lab result or a visit or a weekly check in every past week.
    past = [f for f in j["findings"] if f["week"] < 0]
    assert len({f["week"] for f in past}) >= 24 and {"reading", "world", "check"} <= {f["kind"] for f in past}
    assert j["graphs"] == {"memory": "mem_sunita", "hospital": "hosp_hyd", "shared": "exchange"}
    assert db.raw("MATCH (r:LabResult) RETURN count(r) AS n")[0]["n"] == 0  # clinical history stays private
    assert db.raw("MATCH (pb:Playbook) RETURN count(pb) AS n", graph="mem_sunita")[0]["n"] == 3  # procedural memory


def test_week_one_the_agents_act_and_form_a_swap_without_a_click():
    r = c.post("/api/personas/sunita/advance").json()
    assert (r["finding"]["previous_stage"], r["finding"]["stage"]) == ("watch", "prepare")
    assert len(r["handoffs_run"]) == 4  # scheduler x2, committee clerk, liaison
    d = r["decision"]
    assert d["action"] == "form_swap" and "rules" in (d["safety_net"] or "")  # no model configured here
    assert [t["tool"] for t in d["trace"]][0] == "find_swaps" and d["trace"][0]["input"] == {"max_size": 2}
    j = c.get("/api/personas/sunita").json()
    assert j["case"] and j["case"]["status"] in ("offered", "testing")
    assert j["why"] and all(l["reasons"] for l in j["why"])  # why this swap: read from the edges
    assert {s["depth"] for s in j["searches"]} == {2} and j["searches"][0]["found"] > 0
    assert all(pid in j["places"] for l in j["why"] for pid in (l["from_pair"], l["to_pair"]))


def test_each_agent_says_what_it_read_and_who_wrote_it():
    """Shared memory, visibly used: the coordinator reads the health watch's beliefs, the health watch reads the stage
    it remembered and its playbook, and the scheduler, clerk and liaison pick up the health watch's tasks."""
    j = c.get("/api/personas/sunita").json()
    coord = next(f for f in j["findings"] if f["kind"] == "decision")
    read = {x["memory"]: x for x in coord["read"]}
    assert read["beliefs"]["written_by"] == "Health watch" and read["beliefs"]["n"] >= 2
    assert read["failed-link memories for this patient"]["written_by"] == "Crossmatch coordinator"
    watch = next(f for f in j["findings"] if f["kind"] == "stage_change" and f["read"])
    kinds = {x["kind"]: x for x in watch["read"]}
    assert kinds["semantic"]["memory"] == "remembered stage" and kinds["procedural"]["n"] == 4
    picked = [h for h in j["handoffs"] if h["status"] == "done"]
    assert picked and all(h["read"].startswith("Picked up the Health watch's task") for h in picked)


def test_sunita_reaches_a_transplant_one_step_a_week():
    actions = []
    for _ in range(6):
        r = c.post("/api/personas/sunita/advance")
        if r.status_code != 200:
            break
        actions.append((r.json()["decision"] or {}).get("action"))
    assert actions[0] == "run_tests" and "book_surgery" in actions
    j = c.get("/api/personas/sunita").json()
    assert j["transplanted"] and j["case"]["transplanted_at"]
    assert c.post("/api/personas/sunita/advance").status_code == 409
    assert any(l["loop_id"] == j["case"]["loop_id"] for l in c.get("/api/pool").json()["loops"])  # stays on the map


def test_rajesh_shallow_misses_deep_finds_after_a_family_joins():
    c.post("/api/personas/rajesh/reset")
    r = c.post("/api/personas/rajesh/advance").json()
    assert r["decision"]["action"] == "wait"
    r = c.post("/api/personas/rajesh/advance").json()
    assert any("joined the pool" in s for s in r["world"]) and r["decision"]["action"] == "form_swap"
    j = c.get("/api/personas/rajesh").json()
    week2 = {s["depth"]: s["found"] for s in j["searches"] if s["week"] == 2}
    assert week2[2] == 0 and week2[3] >= 1  # the 2-way search misses it; the 3-way search finds it
    assert len(j["case"]["pairs"]) == 3 and "P-0903" in j["case"]["pairs"]


def test_the_model_chooses_tools_one_action_a_week(monkeypatch):
    c.post("/api/personas/rajesh/reset")
    c.post("/api/personas/rajesh/advance")  # week 1: rules, nothing found
    _scripted(monkeypatch,
              _calls(("find_swaps", {"max_size": 2})),
              _calls(("find_swaps", {"max_size": 3})),
              _calls(("form_swap", {"reason": "A 3-way swap appeared once the Mumbai family joined."}),
                     ("run_tests", {"loop_id": "L-0001", "reason": "Too early."})))
    d = c.post("/api/personas/rajesh/advance").json()["decision"]
    assert d["action"] == "form_swap" and d["safety_net"] is None and d["model"].startswith("groq/")
    assert [t["by"] for t in d["trace"]] == ["model"] * 4
    assert "one action per week" in d["trace"][-1]["error"]  # the second write in the same week was refused
    assert d["reason"].startswith("A 3-way swap appeared")
    f = next(x for x in c.get("/api/personas/rajesh").json()["findings"] if x["kind"] == "decision")
    assert f["action"] == "form_swap" and len(f["trace"]) == 4  # the trace is remembered with the decision


def test_safety_net_runs_a_due_step_the_model_skips(monkeypatch):
    lid = c.get("/api/personas/rajesh").json()["case"]["loop_id"]
    _scripted(monkeypatch, _calls(("wait", {"reason": "Nothing to do."})))
    d = c.post("/api/personas/rajesh/advance").json()["decision"]
    assert d["action"] == "run_tests" and "Safety net" in d["safety_net"]
    assert d["trace"][-1]["by"] == "rules" and d["trace"][-1]["input"]["loop_id"] == lid


def test_a_reason_naming_a_family_the_result_doesnt_show_is_replaced(monkeypatch):
    lid = c.get("/api/personas/rajesh").json()["case"]["loop_id"]
    _scripted(monkeypatch, _calls(("request_papers", {"loop_id": lid, "reason": "Asked P-1234 for papers."})))
    d = c.post("/api/personas/rajesh/advance").json()["decision"]
    assert d["action"] == "request_papers" and d["reason"] == "" and "P-1234" in d["safety_net"]


def test_patient_chat_is_stored_in_memory_and_survives_a_replay(monkeypatch):
    http = _scripted(monkeypatch,
                     _calls(("patient_memory", {"pair_id": "P-0902"})),
                     {"role": "assistant", "content": "Rajesh is in a 3-way liver swap; the agents formed it after a new family joined."})
    r = c.post("/api/personas/rajesh/chat", json={"message": "Why was this swap chosen?"}).json()
    assert [m["role"] for m in r["messages"]][-2:] == ["user", "assistant"] and r["messages"][-1]["tools"] == ["patient_memory"]
    assert "P-0902" in http.bodies[0]["messages"][-1]["content"]  # the question is framed around the patient
    assert c.get("/api/personas/rajesh/chat").json()["messages"][-1]["text"].startswith("Rajesh is in")
    n = len(r["messages"])  # the graph-answered starter questions, then this question and its answer
    assert n == 8 and r["messages"][0]["role"] == "user"
    c.post("/api/personas/rajesh/reset")
    assert len(c.get("/api/personas/rajesh").json()["conversation"]) == n  # the conversation outlives a replay
    scenario.load()
    assert len(c.get("/api/personas/rajesh").json()["conversation"]) == n  # and Restart demo
    assert c.post("/api/personas/rajesh/chat", json={"message": " "}).status_code == 400


def test_session_greeting_comes_from_memory():
    c.post("/api/personas/rajesh/advance")
    g = c.post("/api/personas/rajesh/session").json()["greeting"]
    assert "Since your last look" in g
    assert c.post("/api/personas/rajesh/session").json()["reused"] is True


def test_replay_undoes_the_swap_and_the_arrival():
    c.post("/api/personas/rajesh/advance")
    c.post("/api/personas/rajesh/reset")
    j = c.get("/api/personas/rajesh").json()
    assert j["week"] == 0 and not j["case"] and not j["handoffs"] and not j["searches"]
    assert not db.raw("MATCH (q:Pair {pair_id: 'P-0903'}) RETURN q")
    assert c.get("/api/personas/nobody").status_code == 404


def test_ask_tool_reads_patient_memory():
    from swapnet import access
    box = ask.ToolBox(access.Viewer("meera", access.policy()["users"]["meera"]))
    m = box.patient_memory("Sunita's P-0901")
    assert m["followed"] and m["memory_graph"] == "mem_sunita" and any(b["about"] == "stage" for b in m["beliefs"])
    assert box.patient_memory("P-0154")["followed"] is False
    with pytest.raises(ask.NotInGraph):
        box.patient_memory("P-9999")

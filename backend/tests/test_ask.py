"""Ask KindRed without calling a model: a scripted client plays the model's turns, so these check the tool layer,
the id validator, scope checks and read-only routing. Needs a running FalkorDB (docker compose up falkordb)."""
from types import SimpleNamespace as NS

from fastapi.testclient import TestClient

from swapnet import access
from swapnet.agents import ask
from swapnet.api.main import app
from swapnet.graph import db

c = TestClient(app)


def _viewer(uid: str = "meera") -> access.Viewer:
    return access.Viewer(uid, access.policy()["users"][uid])


def _msg(*blocks, stop="end_turn"):
    usage = NS(input_tokens=10, output_tokens=5, cache_read_input_tokens=0)
    return NS(content=list(blocks), stop_reason=stop, usage=usage, model="scripted")


def _text(t):
    return NS(type="text", text=t)


def _call(name, args, i="t1"):
    return NS(type="tool_use", name=name, input=args, id=i)


class Scripted:
    """Stands in for anthropic.Anthropic: returns the given turns in order and records each request."""

    def __init__(self, *turns):
        self.turns, self.requests = list(turns), []
        self.beta = NS(messages=NS(create=self._create))

    def _create(self, **kw):
        self.requests.append(kw)
        return self.turns.pop(0)


def _release_kolkata() -> str:
    """Break S-0076 in the lab, so its families are waiting again, and return one that has candidate loops.
    Which other families are still waiting depends on the optimiser's plan (CP-SAT may pick a different plan of equal
    value when the machine is busy), so the tests don't assume a particular released family has options."""
    c.post("/api/demo/reset")
    c.post("/api/demo/add-chennai")
    assert c.post("/api/loops/S-0076/lab").json()["results"][-1]["result"] == "positive"
    box = ask.ToolBox(_viewer())
    pid = next((p for p in ("P-0388", "P-0211", "P-0154") if box.find_loops_for(p, 3)["found"]), None)
    assert pid, "no released family of S-0076 has a candidate loop"
    return pid


def test_a_family_already_in_a_loop_is_not_searched():
    c.post("/api/demo/reset")
    out = ask.ToolBox(_viewer()).find_loops_for("P-0388", 3)
    assert out["found"] == 0 and "not waiting" in out["note"]


def test_tools_trace_queries_and_validate_ids():
    pid = _release_kolkata()
    model = Scripted(
        _msg(_call("find_loops_for", {"pair_id": pid, "max_size": 2}, "a"),
             _call("find_loops_for", {"pair_id": pid, "max_size": 3}, "b"), stop="tool_use"),
        _msg(_text("PLACEHOLDER")),
    )
    out = ask.ask(f"Find a new loop for {pid}", _viewer(), client=model)
    shallow, deep = out["trace"]
    assert shallow["tool"] == "find_loops_for" and deep["input"]["max_size"] == 3
    assert all(q["read_only"] for t in out["trace"] for q in t["queries"])
    assert {q["query"] for q in deep["queries"]} >= {"Q04_two_way_loops", "Q05_three_way_loops"}
    assert out["paths"] and out["nodes"]
    # The tool results went back to the model as one user turn with both results.
    sent = model.requests[1]["messages"][-1]["content"]
    assert [r["tool_use_id"] for r in sent] == ["a", "b"]
    assert model.requests[0]["tools"] == ask.TOOLS and model.requests[0]["model"] == ask.MODEL


def test_an_id_the_graph_never_returned_replaces_the_answer():
    pid = _release_kolkata()
    seen = ask.ToolBox(_viewer()).find_loops_for(pid, 3)["best"][0]["pairs"]
    model = Scripted(
        _msg(_call("find_loops_for", {"pair_id": pid, "max_size": 3}), stop="tool_use"),
        _msg(_text(f"Best loop: {' -> '.join(seen)}. Also P-4242 could help.")),
    )
    out = ask.ask("Who could replace Kolkata?", _viewer(), client=model)
    assert out["draft_replaced"] and out["unverified_ids"] == ["P-4242"]
    assert "P-4242" not in out["answer"] and "couldn't verify" in out["answer"]

    good = Scripted(
        _msg(_call("find_loops_for", {"pair_id": pid, "max_size": 3}), stop="tool_use"),
        _msg(_text(f"Best loop: {' -> '.join(seen)}.")),
    )
    ok = ask.ask("Who could replace Kolkata?", _viewer(), client=good)
    assert not ok["draft_replaced"] and set(seen) <= set(ok["verified_ids"])


def test_unknown_ids_and_out_of_scope_ids_are_refused_before_any_traversal():
    model = Scripted(
        _msg(_call("withdrawal_impact", {"pair_id": "P-9999"}, "x"), stop="tool_use"),
        _msg(_text("P-9999 is not in the graph.")),
    )
    out = ask.ask("What if P-9999 withdraws?", _viewer(), client=model)
    t = out["trace"][0]
    assert "not in the graph: P-9999" in t["error"] and t["rows"] == 0
    assert [q["query"] for q in t["queries"]] == ["Q36_resolve_ids"]   # nothing else ran
    assert not out["draft_replaced"]                                    # the id came from the question itself

    liver_only = Scripted(
        _msg(_call("explain_loop", {"loop_id": "S-0076"}), stop="tool_use"),
        _msg(_text("I can't see that loop.")),
    )
    out = ask.ask("Explain S-0076", _viewer("che_liver"), client=liver_only)
    assert "outside" in out["trace"][0]["error"]


def test_withdrawal_impact_and_multi_hop_reach():
    c.post("/api/demo/reset")
    box = ask.ToolBox(_viewer())
    imp = box.withdrawal_impact("P-0211")
    s76 = next(l for l in imp["live_loops"] if l["loop_id"] == "S-0076")
    assert s76["families"] == ["P-0154", "P-0211", "P-0388"] and s76["fallback_survives"] is False
    near, far = box.reachable_within("P-0388", 1), box.reachable_within("P-0388", 3)
    assert set(near["by_hops"]) == {1} and far["reachable"] >= near["reachable"]
    assert all(len(r["route"]) == r["hops"] + 1 for r in far["routes"])


def test_read_only_named_queries_go_through_ro_query():
    assert db.is_read_only("Q04_two_way_loops") and db.is_read_only("Q33_reachable_within")
    assert not db.is_read_only("Q10_record_failure") and not db.is_read_only("Q17_failure_priors")
    every = db.all_queries()
    assert all(db.is_read_only(n) for n in ("Q32_withdrawal_impact", "Q34_connection_path", "Q35_failure_memory", "Q36_resolve_ids"))
    assert len(every) >= 36


def test_ask_endpoint_explains_a_missing_model(monkeypatch):
    monkeypatch.setenv("KINDRED_ASK_PROVIDER", "anthropic")
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    monkeypatch.delenv("ANTHROPIC_AUTH_TOKEN", raising=False)
    st = c.get("/api/ask/status").json()
    assert st["enabled"] is False and st["provider"] == "anthropic"
    r = c.post("/api/ask", json={"question": "Why S-0076?"})
    assert r.status_code == 503 and "ANTHROPIC_API_KEY" in r.json()["detail"]
    assert c.post("/api/ask", json={"question": "  "}).status_code == 400

    # Without a key the default is the free local model; an Ollama that isn't running is reported, not crashed on.
    monkeypatch.delenv("KINDRED_ASK_PROVIDER")
    monkeypatch.setattr(ask, "OLLAMA_URL", "http://127.0.0.1:9")
    st = c.get("/api/ask/status").json()
    assert st["provider"] == "ollama" and st["enabled"] is False and "ollama pull" in st["how"]


class FakeOllama:
    """Plays Ollama's /api/chat: returns the given message dicts in order and records each request body."""

    def __init__(self, *messages):
        self.messages, self.bodies = list(messages), []

    def post(self, url, json):
        self.bodies.append(json)
        msg = self.messages.pop(0)
        return NS(raise_for_status=lambda: None,
                  json=lambda: {"message": msg, "done_reason": "stop", "prompt_eval_count": 100, "eval_count": 20})


def test_a_local_model_through_ollama_uses_the_same_tools_and_checks():
    pid = _release_kolkata()
    http = FakeOllama(
        # Small models pass ids loosely and may send arguments as a JSON string.
        {"role": "assistant", "content": "", "tool_calls": [
            {"function": {"name": "find_loops_for", "arguments": f'{{"pair_id": "Kolkata family {pid}", "max_size": "3"}}'}}]},
        {"role": "assistant", "content": f"{pid} can join a new loop."},
    )
    llm = ask.OllamaLLM(base="http://ollama.test", model="llama3.1:8b", http=http)
    out = ask.ask(f"Find a new loop for {pid}", _viewer(), llm=llm)
    t = out["trace"][0]
    assert t["tool"] == "find_loops_for" and "error" not in t and t["rows"] == 1
    assert out["provider"] == "ollama" and out["model"] == "ollama/llama3.1:8b" and not out["draft_replaced"]
    first, second = http.bodies
    assert first["messages"][0]["role"] == "system" and first["tools"][0]["type"] == "function"
    assert {x["function"]["name"] for x in first["tools"]} == {x["name"] for x in ask.TOOLS}
    assert second["messages"][-1]["role"] == "tool" and second["messages"][-1]["tool_name"] == "find_loops_for"
    assert first["options"]["temperature"] == 0


def test_verified_answers_are_remembered_and_recalled_within_scope():
    pid = _release_kolkata()
    seen = ask.ToolBox(_viewer()).find_loops_for(pid, 3)["best"][0]["pairs"]
    model = Scripted(
        _msg(_call("find_loops_for", {"pair_id": pid, "max_size": 3}), stop="tool_use"),
        _msg(_text(f"Best loop for {pid}: {' -> '.join(seen)}.")),
    )
    out = ask.ask(f"Find a new loop for {pid}", _viewer(), client=model)
    qid = out["remembered_as"]
    assert qid and out["trace"][-1]["tool"] == "(memory) remember_answer"

    # A later session recalls it, dated; a viewer outside its hospitals and program does not see it.
    mem = ask.ToolBox(_viewer()).recall([pid])
    assert mem[0]["question_id"] == qid and mem[0]["learned"]
    assert ask.ToolBox(_viewer("che_liver")).recall([pid]) == []
    hist = c.get("/api/ask/history").json()["questions"]
    assert hist[0]["question_id"] == qid and pid in hist[0]["about"]
    assert all(h["question_id"] != qid for h in c.get("/api/ask/history", headers={"X-KindRed-User": "che_liver"}).json()["questions"])

    # A replaced (unverified) answer is never remembered.
    bad = Scripted(
        _msg(_call("find_loops_for", {"pair_id": pid, "max_size": 3}), stop="tool_use"),
        _msg(_text("Try P-4242.")),
    )
    assert ask.ask("Who else?", _viewer(), client=bad)["remembered_as"] is None


def test_tool_calls_written_as_text_are_run_or_removed():
    fake = 'P-9999 is not in the graph.\n\nHowever, let me try a search.\n\n{"name": "search_pairs", "parameters": {"query": "P-9999"}}'
    text, calls = ask.text_calls(fake)
    assert calls == [] and text == "P-9999 is not in the graph."
    real = 'Checking.\n\n{"name": "withdrawal_impact", "parameters": {"pair_id": "P-0211"}}'
    text, calls = ask.text_calls(real)
    assert calls == [("text_0", "withdrawal_impact", {"pair_id": "P-0211"})]


def test_answers_only_about_ids_the_graph_lacks_are_not_remembered():
    assert ask.remember("What if P-9999 withdraws?", "P-9999 is not in the graph.", _viewer(), ["P-9999"], ["withdrawal_impact"]) is None

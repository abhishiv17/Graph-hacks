"""Chats about one patient (Kin on a patient's or family's page): starter questions answered from the graph, questions
about other families turned away before any model is asked, and the question framed around the patient. Uses its
own chat graphs, never the real conversations. Needs a running FalkorDB; resets the demo graph."""
import pytest
from fastapi.testclient import TestClient

from swapnet import chat, personas, scenario
from swapnet.api.main import app
from swapnet.graph import db

c = TestClient(app)


@pytest.fixture(scope="module", autouse=True)
def _demo():
    scenario.load()


@pytest.fixture(autouse=True)
def _test_chat(monkeypatch):
    monkeypatch.setattr(personas, "chat_graph", lambda pid: f"test_chat_{pid}")
    yield
    for g in db.db().list_graphs():
        if g.startswith("test_chat_"):
            db.db().select_graph(g).delete()


def test_a_new_chat_starts_with_graph_answers_about_that_family():
    d = c.get("/api/families/P-0388/chat").json()
    assert d["about"] == "the family in Kolkata (P-0388)"
    users = [m["text"] for m in d["messages"] if m["role"] == "user"]
    assert len(users) == 3 and "mother" in users[0]
    assert all("no model" in m["model"] for m in d["messages"] if m["role"] == "assistant")
    assert len(c.get("/api/families/P-0388/chat").json()["messages"]) == 6  # started once, not again


def test_a_demo_patient_chat_is_found_by_persona_or_pair():
    assert chat.subject("P-0901")["key"] == "sunita" and chat.subject("sunita")["first"] == "Sunita"
    assert c.get("/api/families/P-9999/chat").status_code == 404


def test_questions_about_other_families_are_turned_away_without_a_model(monkeypatch):
    monkeypatch.setenv("GROQ_API_KEY", "")  # no model at all: the guard answers on its own
    r = c.post("/api/families/P-0388/chat", json={"message": "What about P-1004's donor?"}).json()
    assert "only talk about the family in Kolkata" in r["answer"] and r["trace"] == []
    # The swap's own families are fine to mention.
    assert chat.off_topic(chat.subject("P-0388"), "How is P-0154 doing in our swap?") is None


def test_the_question_is_framed_around_the_patient():
    f = chat.frame(chat.subject("rajesh"), "Why this swap?")
    assert "only about Rajesh Nair (P-0902)" in f and "patient_memory" in f


def test_an_answer_from_memory_says_when_it_was_learned():
    msgs = c.get("/api/personas/sunita/chat").json()["messages"]
    remembered = next(m for m in msgs if m["role"] == "assistant" and "memory graph" in m["text"])
    assert remembered["memory"] and all(m["at"] and m["by"].startswith("Health watch") for m in remembered["memory"])
    # Answers worked out from the graph now carry no memory note.
    assert next(m for m in msgs if m["role"] == "assistant")["memory"] == []


def test_two_visitors_opening_a_new_chat_at_once_start_it_once():
    from concurrent.futures import ThreadPoolExecutor
    with ThreadPoolExecutor(8) as pool:
        list(pool.map(lambda _: c.get("/api/families/P-0154/chat"), range(8)))
    assert len(personas.conversation("p-0154")) == 6

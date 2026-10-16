"""The reasoning layer: plain why-nots from the graph, hover explanations, and the walkthrough steps. English only and no
voice calls, so nothing spends the Sarvam quota. Needs a running FalkorDB; resets the demo graph."""
import pytest
from fastapi.testclient import TestClient

from swapnet import reasoning, scenario, voice
from swapnet.api.main import app

c = TestClient(app)


@pytest.fixture(scope="module", autouse=True)
def _demo():
    scenario.load()


def test_why_not_reads_the_blood_group_rule_and_antibodies():
    # S-0076's story: Hyderabad's donor (A) can't give to its own patient (B), nor to Kolkata's (B).
    assert "blood group A can't give to blood group B" == reasoning.why_not("P-0154", "P-0154")
    assert reasoning.why_not("P-0154", "P-0211") == ""  # a live link: nothing to explain
    assert reasoning.why_not("P-0154", "P-0388") == "blood group A can't give to blood group B"  # Hyderabad's donor, Kolkata's patient


def test_explorer_carries_hover_explanations():
    g = c.get("/api/families/P-0154/explore?hops=2").json()
    fams = [n for n in g["nodes"] if n["type"] == "family" and n["id"] != "fam:P-0154"]
    assert fams and all(n.get("why") for n in fams)
    assert all(e.get("why") for e in g["edges"] if e["type"] == "CAN_GIVE_TO")


def test_family_walkthrough_tells_the_story_with_highlights():
    w = c.get("/api/families/P-0154/walkthrough").json()
    steps = w["steps"]
    assert w["lang"] == "en-IN" and len(steps) >= 5
    assert "can't give to their own patient" in steps[1]["text"] and steps[1]["edges"]  # the why-not-own path lights up
    assert any("2-way swap" in s["text"] for s in steps) and any(s["hops"] == 3 for s in steps)
    assert all("P-" not in s["spoken"] for s in steps)  # ids stay on screen, not in the voice
    assert c.get("/api/families/P-9999/walkthrough").status_code == 404
    assert c.get("/api/families/P-0154/walkthrough?lang=xx-XX").status_code == 400


def test_swap_walkthrough_explains_each_donation():
    w = c.get("/api/swaps/S-0076/walkthrough").json()
    donations = [s for s in w["steps"] if s["text"].startswith("Donation")]
    assert len(donations) == 3 and all(len(s["edges"]) == 1 for s in donations)
    assert "chance every donation works" in w["steps"][-1]["text"]


def test_voice_needs_a_key(monkeypatch):
    monkeypatch.setenv("SARVAM_API_KEY", "")
    assert voice.status()["enabled"] is False
    assert c.post("/api/voice/speak", json={"text": "hello", "lang": "en-IN"}).status_code == 503
    assert voice.translate("hello", "hi-IN") == "hello"  # no key: the walkthrough stays in English

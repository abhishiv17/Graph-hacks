"""The family explorer (swapnet/explore.py, GET /api/families/{id}/explore): a family's parts, why its own donor can't
give, and the swaps that close back at hop 2 and 3. Needs a running FalkorDB; resets the demo graph."""
from fastapi.testclient import TestClient

from swapnet import explore, scenario
from swapnet.api.main import app

c = TestClient(app)


def setup_module():
    scenario.load()


def test_sunita_breaks_into_parts_and_the_b44_path_explains_her_own_donor():
    g = explore.family("P-0901", 1)
    types = {n["type"] for n in g["nodes"]}
    assert {"family", "patient", "donor", "blood", "antigen", "antibody", "hospital"} <= types
    assert "B44" in g["why_not_own"]["text"]
    path = {e["id"] for e in g["edges"] if e["mark"] == "own"}
    assert path == set(g["why_not_own"]["edges"]) and len(path) == 3  # patient → anti-B44 → B44 ← donor
    assert not g["loops"]  # one hop shows direct links only


def test_hops_add_two_way_then_three_way_swaps_that_close_back():
    two = explore.family("P-0902", 2)
    three = explore.family("P-0902", 3)
    assert all(l["size"] == 2 and l["pairs"][0] == "P-0902" for l in two["loops"])
    assert any(l["size"] == 3 for l in three["loops"])
    marked = {e["mark"] for e in three["edges"] if e["type"] == "CAN_GIVE_TO"}
    assert "loop3" in marked
    assert len(three["edges"]) < 120  # only the links that tell the story, never every link among the shown families


def test_a_family_not_in_the_graph_says_so():
    assert c.get("/api/families/P-9999/explore").status_code == 404
    assert c.get("/api/families/p-0154/explore?hops=2").json()["center"] == "P-0154"

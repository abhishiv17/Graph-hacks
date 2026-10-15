"""KindRed MCP server: graph queries and agent actions as tools any MCP client can call.

Run:  python -m swapnet.mcp.server        (stdio)
Each tool returns the named Cypher queries it ran, so callers can show their work.
Tools that change state (offer, record, approve) still leave approval of repairs to a person.
"""
import json

from mcp.server.fastmcp import FastMCP

from swapnet import scenario
from swapnet.agents import core, lab
from swapnet.gen.generator import Pair
from swapnet.graph import db, publish
from swapnet.optimiser.solver import Candidate, solve

mcp = FastMCP("swapnet", instructions=(
    "Kidney swap coordination on a FalkorDB graph (synthetic data only). The graph finds loops, "
    "an optimiser with stated rules chooses, and a person approves repairs. Never invent medical facts: "
    "explain only with what explain() returns."))


def _q(fn):
    with db.track() as tr:
        out = fn()
    return {"result": out, "queries": tr.ran}


@mcp.tool()
def add_pair(pair: dict) -> dict:
    """Register a synthetic pair at its hospital and publish it to the shared pool if consent,
    near-relative and nationality rules pass. `pair` has pair_id, hospital, donor, patient, antigens, antibodies, documents."""
    pr = Pair(**pair)
    return _q(lambda: core.IntakeAgent(pr.hospital).add_pair(pr))


@mcp.tool()
def virtual_crossmatch(donor_pair: str, patient_pair: str, mfi: int = 2000) -> dict:
    """Donor antigen <- antibody <- patient traversal. Returns clashing antigens and untyped loci."""
    return _q(lambda: db.run("Q03_virtual_crossmatch", {"donor_pair": donor_pair, "patient_pair": patient_pair, "mfi": mfi}))


@mcp.tool()
def components() -> dict:
    """Weakly connected components of the compatibility graph (independent sub-problems)."""
    return _q(lambda: db.run("Q07_components"))


@mcp.tool()
def find_loops(max_len: int = 3, pair_ids: list[str] | None = None) -> dict:
    """Enumerate 2-way (and 3-way) loops among waiting pairs, optionally only through given pairs."""
    def f():
        rows = db.run("Q04_two_way_loops", {"ids": pair_ids})
        if max_len >= 3:
            rows += db.run("Q05_three_way_loops", {"ids": pair_ids})
        return rows
    return _q(f)


@mcp.tool()
def optimise(loops: list[dict], failure_aware: bool = True) -> dict:
    """Choose non-overlapping loops (each {pairs, probs}) maximising expected transplants."""
    res = solve([Candidate(l["pairs"], l["probs"]) for l in loops], failure_aware=failure_aware)
    return {**{k: res[k] for k in ("optimal", "solve_ms", "expected_tx", "planned_tx")},
            "chosen": [{"pairs": c.pairs, "expected": round(c.expected, 2)} for c in res["chosen"]]}


@mcp.tool()
def run_plan(failure_aware: bool = True) -> dict:
    """Matching agent: components -> loops -> optimise -> save plan -> offer each loop."""
    r = core.MatchingAgent().run_plan(failure_aware=failure_aware)
    return {k: r[k] for k in ("run_id", "loops", "expected_tx", "planned_tx", "solve_ms", "optimal", "queries")}


@mcp.tool()
def explain(loop_id: str) -> dict:
    """Link-by-link reasons for a loop, read from the CAN_GIVE_TO edges."""
    return _q(lambda: db.run("Q13_explain_loop", {"loop_id": loop_id}))


@mcp.tool()
def offer_loop(loop_id: str) -> dict:
    """Offer a selected loop to every hospital in it; refuses if any pair is already in an offer."""
    return _q(lambda: core.MatchingAgent().offer(loop_id))


@mcp.tool()
def respond_offer(offer_id: str, hospital: str) -> dict:
    """The hospital's intake agent answers an offer (accept, decline or hold) from its policy."""
    return {"response": core.IntakeAgent(hospital).respond(offer_id)}


@mcp.tool()
def run_lab_tests(loop_id: str) -> dict:
    """Send a loop's pending crossmatch tests to the (simulated) lab and act on the results."""
    return _q(lambda: core.CrossmatchCoordinator().run_lab(loop_id))


@mcp.tool()
def record_crossmatch(test_id: str, result: str, antibody: str | None = None, mfi: int | None = None) -> dict:
    """Record a lab result. A positive result writes the failure and triggers a local repair proposal."""
    return _q(lambda: core.CrossmatchCoordinator().record(test_id, result, antibody, mfi))


@mcp.tool()
def local_repair(loop_id: str) -> dict:
    """Show the open repair proposal (recommended loop, alternatives, stored fallback) for a broken loop."""
    t = db.raw("MATCH (t:Task)-[:ABOUT]->(:Loop {loop_id: $l}) RETURN t.payload AS p, t.task_id AS id, t.status AS s "
               "ORDER BY t.created_at DESC LIMIT 1", {"l": loop_id})
    return {"task_id": t[0]["id"], "status": t[0]["s"], **json.loads(t[0]["p"])} if t else {"proposal": None}


@mcp.tool()
def decision_trail(loop_id: str) -> dict:
    """Decisions about a loop: who decided, who approved, and the facts each was based on."""
    return _q(lambda: db.run("Q14_decision_trail", {"loop_ids": [loop_id], "failure_ids": [], "pair_ids": []}))


@mcp.tool()
def committee_readiness(loop_id: str) -> dict:
    """Documents per pair, day count against the 6-8 week target, and the pair blocking the loop."""
    return _q(lambda: core.CommitteeClerk().readiness(loop_id))


@mcp.tool()
def escalate(loop_id: str, note: str) -> dict:
    """Hand a decision to the exchange coordinator (a person)."""
    tid = core.MatchingAgent()._task("escalate", loop_id, {"note": note})
    db.event("Matching agent", f"Escalated {loop_id} to the exchange coordinator: {note}", "warn")
    return {"task_id": tid}


@mcp.tool()
def patient_status(pair_id: str) -> dict:
    """One family's own case in plain language. Never includes other families' data."""
    return core.family_status(pair_id)


@mcp.tool()
def lab_crossmatch_preview(donor_pair: str, donor_hospital: str, patient_pair: str) -> dict:
    """What the simulated lab would return for one link (for testing the simulator)."""
    return lab.crossmatch(donor_pair, donor_hospital, patient_pair)


@mcp.tool()
def reset_demo() -> dict:
    """Reload the synthetic demo pool and scenario S-0031."""
    r = scenario.load()
    return {"pairs": r["pairs"], "plan": r["plan"]["run_id"]}


if __name__ == "__main__":
    mcp.run()

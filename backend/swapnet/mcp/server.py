"""KindRed MCP server: graph queries and agent actions as tools any MCP client can call.

Run:  python -m swapnet.mcp.server        (stdio)
Each tool returns the named Cypher queries it ran, so callers can show their work.
Tools that change state (offer, record, approve) still leave approval of repairs to a person.
"""
import json

from mcp.server.fastmcp import FastMCP

from swapnet import access, organs, programs, scenario
from swapnet.agents import ask, core
from swapnet.gen.generator import Pair
from swapnet.graph import db, publish
from swapnet.optimiser.solver import Candidate, solve

mcp = FastMCP("swapnet", instructions=(
    "Living-donor exchange coordination for two programs, kidney and liver, on a FalkorDB graph (synthetic data only). "
    "Every matching tool takes an explicit organ ('kidney' or 'liver'); each family belongs to one program and loops "
    "never mix organs. The graph finds loops, an optimiser with stated rules ranks them, and a person approves every "
    "repair. You may search, compare, rank by the configured rules and explain returned evidence. You may not approve a "
    "transplant, allocate an organ, declare anyone medically suitable or invent a fact: explain only with what "
    "explain_evidence() and program_rules() return."))


def _q(fn):
    with db.track() as tr:
        out = fn()
    return {"result": out, "queries": tr.ran}


def _unknown(pairs: tuple[str, ...] = (), loops: tuple[str, ...] = ()) -> dict | None:
    """Resolve ids against the graph before a tool reasons about them, so an invented or mistyped id gets a
    plain "not in the graph" answer instead of an empty result that reads like a finding."""
    found = db.raw("OPTIONAL MATCH (p:Pair) WHERE p.pair_id IN $p WITH collect(p.pair_id) AS ps "
                   "OPTIONAL MATCH (l:Loop) WHERE l.loop_id IN $l RETURN ps, collect(l.loop_id) AS ls",
                   {"p": list(pairs), "l": list(loops)})[0]
    missing = [x for x in pairs if x not in found["ps"]] + [x for x in loops if x not in found["ls"]]
    return {"error": f"not in the graph: {', '.join(missing)}"} if missing else None


@mcp.tool()
def add_pair(pair: dict) -> dict:
    """Register a synthetic pair at its hospital and publish it to the shared pool if consent,
    near-relative and nationality rules pass. `pair` has pair_id, hospital, donor, patient, antigens, antibodies, documents,
    and optionally organ ("kidney" or "liver"; liver pairs also carry liver = their LiverProfile and liver_ct)."""
    pr = Pair(**pair)
    return _q(lambda: core.IntakeAgent(pr.hospital).add_pair(pr))


@mcp.tool()
def virtual_crossmatch(donor_pair: str, patient_pair: str, mfi: int = 2000) -> dict:
    """Donor antigen <- antibody <- patient traversal. Returns clashing antigens and untyped loci."""
    if err := _unknown(pairs=(donor_pair, patient_pair)):
        return err
    return _q(lambda: db.run("Q03_virtual_crossmatch", {"donor_pair": donor_pair, "patient_pair": patient_pair, "mfi": mfi}))


@mcp.tool()
def components() -> dict:
    """Weakly connected components of the compatibility graph (independent sub-problems)."""
    return _q(lambda: db.run("Q07_components"))


@mcp.tool()
def find_loops(organ: str, max_len: int = 3, pair_ids: list[str] | None = None) -> dict:
    """Enumerate 2-way (and 3-way) loops among waiting pairs of one program (organ: 'kidney' or 'liver'),
    optionally only through given pairs."""
    organ = programs.check_organ(organ)
    if organ is None:
        raise ValueError("organ is required: 'kidney' or 'liver'")
    def f():
        rows = db.run("Q04_two_way_loops", {"ids": pair_ids, "organ": organ})
        if max_len >= 3:
            rows += db.run("Q05_three_way_loops", {"ids": pair_ids, "organ": organ})
        return rows
    return _q(f)


@mcp.tool()
def find_exchange_candidates(organ: str, pair_id: str) -> dict:
    """Possible donations to and from one pair inside its own program, with the reasons on each link.
    The organ must match the pair's program; a kidney pair is never compared with liver pairs."""
    organ = programs.check_organ(organ)
    if organ is None:
        raise ValueError("organ is required: 'kidney' or 'liver'")
    if err := _unknown(pairs=(pair_id,)):
        return err
    def f():
        rows = db.run("Q30_exchange_candidates", {"pair_id": pair_id, "organ": organ})
        if not rows:
            return {"error": f"{pair_id} is not a {organ} pair"}
        r = rows[0]
        return {**r, "gives": [g for g in r["gives"] if g], "receives": [x for x in r["receives"] if x]}
    return _q(f)


@mcp.tool()
def explain_evidence(loop_id: str) -> dict:
    """Evidence for each link of a loop: recorded facts, constraints satisfied, flags for a person, the test result,
    any failure, and the human approval status. The only facts an explanation may use."""
    if err := _unknown(loops=(loop_id,)):
        return err
    return _q(lambda: programs.evidence(loop_id))


@mcp.tool()
def program_rules(organ: str) -> dict:
    """A program's matching rules (with sources), committee checklist, planning timeline and demo scenario.
    Program configuration for a demo, not clinical guidance."""
    return programs.program(organ)


@mcp.tool()
def integrity_checks(organ: str | None = None) -> dict:
    """Shared and program-specific workflow checks (missing references, broken links, missing evidence or approvals,
    open reviews). Data-completeness findings only, never diagnoses."""
    return programs.integrity(organ)


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
    if err := _unknown(loops=(loop_id,)):
        return err
    return _q(lambda: db.run("Q13_explain_loop", {"loop_id": loop_id}))


@mcp.tool()
def offer_loop(loop_id: str) -> dict:
    """Offer a selected loop to every hospital in it; refuses if any pair is already in an offer."""
    if err := _unknown(loops=(loop_id,)):
        return err
    return _q(lambda: core.MatchingAgent().offer(loop_id))


@mcp.tool()
def respond_offer(offer_id: str, hospital: str) -> dict:
    """The hospital's intake agent answers an offer (accept, decline or hold) from its policy."""
    return {"response": core.IntakeAgent(hospital).respond(offer_id)}


@mcp.tool()
def run_lab_tests(loop_id: str) -> dict:
    """Send a loop's pending tests (kidney crossmatch, liver CT volumetry) to the (simulated) lab and act on the results.
    A broken, replaced or finished loop gets no tests."""
    if err := _unknown(loops=(loop_id,)):
        return err
    try:
        return _q(lambda: core.CrossmatchCoordinator().run_lab(loop_id))
    except core.LoopClosed as e:
        return {"error": str(e)}


@mcp.tool()
def record_crossmatch(test_id: str, result: str, antibody: str | None = None, mfi: int | None = None) -> dict:
    """Record a lab result. A positive result writes the failure and triggers a local repair proposal."""
    return _q(lambda: core.CrossmatchCoordinator().record(test_id, result, antibody, mfi))


@mcp.tool()
def local_repair(loop_id: str) -> dict:
    """Show the open repair proposal (recommended loop, alternatives, stored fallback) for a broken loop."""
    if err := _unknown(loops=(loop_id,)):
        return err
    t = db.raw("MATCH (t:Task)-[:ABOUT]->(:Loop {loop_id: $l}) RETURN t.payload AS p, t.task_id AS id, t.status AS s "
               "ORDER BY t.created_at DESC LIMIT 1", {"l": loop_id})
    return {"task_id": t[0]["id"], "status": t[0]["s"], **json.loads(t[0]["p"])} if t else {"proposal": None}


@mcp.tool()
def decision_trail(loop_id: str) -> dict:
    """Decisions about a loop: who decided, who approved, and the facts each was based on."""
    if err := _unknown(loops=(loop_id,)):
        return err
    return _q(lambda: db.run("Q14_decision_trail", {"loop_ids": [loop_id], "failure_ids": [], "pair_ids": []}))


@mcp.tool()
def committee_readiness(loop_id: str) -> dict:
    """Documents per pair, day count against the 6-8 week target, and the pair blocking the loop."""
    if err := _unknown(loops=(loop_id,)):
        return err
    return _q(lambda: core.CommitteeClerk().readiness(loop_id))


@mcp.tool()
def escalate(loop_id: str, note: str) -> dict:
    """Hand a decision to the exchange coordinator (a person)."""
    if err := _unknown(loops=(loop_id,)):
        return err
    tid = core.MatchingAgent()._task("escalate", loop_id, {"note": note})
    db.event("Matching agent", f"Escalated {loop_id} to the exchange coordinator: {note}", "warn")
    return {"task_id": tid}


@mcp.tool()
def patient_status(pair_id: str) -> dict:
    """One family's own case in plain language. Never includes other families' data."""
    if err := _unknown(pairs=(pair_id,)):
        return err
    return core.family_status(pair_id)


@mcp.tool()
def lab_crossmatch_preview(donor_pair: str, donor_hospital: str, patient_pair: str) -> dict:
    """What the simulated lab would return for one link, using the donor pair's organ test (for testing the simulator)."""
    if err := _unknown(pairs=(donor_pair, patient_pair)):
        return err
    o = db.raw("MATCH (p:Pair {pair_id: $p}) RETURN p.organ AS o", {"p": donor_pair})
    return organs.get(o[0]["o"] if o else None).run_test(donor_pair, donor_hospital, patient_pair)


def _box() -> ask.ToolBox:
    """The multi-hop tools Ask KindRed uses, run as the exchange coordinator (a local MCP client is trusted)."""
    uid = access.policy()["default_user"]
    return ask.ToolBox(access.Viewer(uid, access.policy()["users"][uid]))


def _graph_tool(fn):
    try:
        return _q(fn)
    except ask.NotInGraph as e:
        return {"error": str(e)}


@mcp.tool()
def withdrawal_impact(pair_id: str) -> dict:
    """What breaks if a family withdraws: its live loops, the other families affected, and whether each loop's
    stored fallback survives without it."""
    return _graph_tool(lambda: _box().withdrawal_impact(pair_id))


@mcp.tool()
def reachable_within(pair_id: str, hops: int = 2) -> dict:
    """Multi-hop reach: waiting families of the same program a family's donor can reach in at most `hops`
    donations (1-3) over live links, with the shortest route to each."""
    return _graph_tool(lambda: _box().reachable_within(pair_id, hops))


@mcp.tool()
def connection_path(from_pair: str, to_pair: str) -> dict:
    """The shortest chain of compatibility links from one family's donor to another family's patient."""
    return _graph_tool(lambda: _box().connection_path(from_pair, to_pair))


@mcp.tool()
def bridge_families(limit: int = 10, organ: str | None = None) -> dict:
    """Waiting families whose withdrawal would break the most possible loops (betweenness centrality)."""
    return _graph_tool(lambda: _box().bridge_families(limit, organ))


@mcp.tool()
def failure_memory(pair_id: str) -> dict:
    """Links remembered as failed around one family, with the test that proved each; never proposed again."""
    return _graph_tool(lambda: _box().failure_memory(pair_id))


@mcp.tool()
def recall(ids: list[str]) -> dict:
    """Agent memory: earlier verified Ask KindRed answers about these families or loops, newest first, dated."""
    return _graph_tool(lambda: _box().recall(ids))


@mcp.tool()
def patient_memory(pair_id: str) -> dict:
    """What the health watch remembers about a demo patient (P-0901, P-0902): beliefs with what each replaced, dated
    findings, and hand-offs still open."""
    return _graph_tool(lambda: _box().patient_memory(pair_id))


@mcp.tool()
def reset_demo() -> dict:
    """Reload the synthetic demo pools (kidney and liver) and both programs' scenarios."""
    r = scenario.load()
    return {"pairs": r["pairs"], "plan": r["plan"]["run_id"]}


if __name__ == "__main__":
    mcp.run()

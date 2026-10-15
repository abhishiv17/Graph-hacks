"""Pick the best set of non-overlapping loops from the loops the graph found.

The graph proposes; this step only chooses. Objectives, in order: expected transplants
(a loop only succeeds if every link does; a 3-way loop with a 2-way fallback inside keeps
some value when the third link fails), then priority for blood group O, highly sensitised
and previously failed patients. Failure-blind mode counts nominal transplants instead.
"""
import math
import time
from dataclasses import dataclass, field

from ortools.sat.python import cp_model


@dataclass
class Candidate:
    pairs: list[str]
    probs: list[float]
    fallback: list | None = None        # [x, y, p_back]: y -> x closes a 2-way inside
    expected: float = 0.0
    bonus: float = 0.0
    meta: dict = field(default_factory=dict)

    @property
    def p_all(self) -> float:
        return math.prod(self.probs)


def expected_transplants(c: Candidate) -> float:
    n = len(c.pairs)
    p_all = c.p_all
    if n == 3 and c.fallback:
        x, y, p_back = c.fallback
        i = c.pairs.index(x)
        p_fwd = c.probs[i]                       # link x -> y is part of the loop
        p_rest = p_all / p_fwd if p_fwd else 0.0
        return 3 * p_all + 2 * p_fwd * p_back * (1 - p_rest)
    return n * p_all


def best_fallback(c: Candidate, options: list[list]) -> list | None:
    """Of the 2-way loops inside a 3-way loop, keep the one that adds the most expected
    transplants. The strongest return link alone is not enough: if the fallback's forward link
    is the loop's riskiest one, it fails together with the loop and saves nothing."""
    def value(fb):
        c.fallback = fb
        return expected_transplants(c)
    best = max(options, key=value, default=None)
    c.fallback = best
    return best


def solve(cands: list[Candidate], bonus: dict[str, float] | None = None, failure_aware: bool = True,
          locked: set[str] | None = None, time_limit: float = 10.0) -> dict:
    bonus = bonus or {}
    locked = locked or set()
    t0 = time.perf_counter()
    usable = [c for c in cands if not (set(c.pairs) & locked)]
    for c in usable:
        c.expected = expected_transplants(c) if failure_aware else float(len(c.pairs))
        c.bonus = sum(bonus.get(p, 0.0) for p in c.pairs)
    m = cp_model.CpModel()
    x = [m.NewBoolVar(f"l{i}") for i in range(len(usable))]
    by_pair: dict[str, list] = {}
    for i, c in enumerate(usable):
        for p in c.pairs:
            by_pair.setdefault(p, []).append(x[i])
    for vs in by_pair.values():
        m.Add(sum(vs) <= 1)
    # Lexicographic by scale: transplants dominate, priority breaks ties.
    m.Maximize(sum(x[i] * (int(round(c.expected * 10_000)) + int(round(c.bonus * 100))) for i, c in enumerate(usable)))
    s = cp_model.CpSolver()
    s.parameters.max_time_in_seconds = time_limit
    s.parameters.num_workers = 8
    status = s.Solve(m)
    chosen = [c for i, c in enumerate(usable) if status in (cp_model.OPTIMAL, cp_model.FEASIBLE) and s.Value(x[i])]
    return {
        "chosen": chosen,
        "optimal": status == cp_model.OPTIMAL,
        "solve_ms": round((time.perf_counter() - t0) * 1000),
        "expected_tx": round(sum(expected_transplants(c) for c in chosen), 2),
        "planned_tx": sum(len(c.pairs) for c in chosen),
        "candidates": len(usable),
    }


def rank_repairs(cands: list[Candidate], released: list[str], bonus: dict[str, float] | None = None) -> list[Candidate]:
    """Rank single-loop repairs for a broken loop. Stated rule: keep as many of the families
    already in the swap together as possible (their tests and approvals carry over), then
    maximise expected transplants, then priority."""
    bonus = bonus or {}
    for c in cands:
        c.expected = expected_transplants(c)
        c.bonus = sum(bonus.get(p, 0.0) for p in c.pairs)
    rel = set(released)
    return sorted(cands, key=lambda c: (-len(rel & set(c.pairs)), -c.expected, -c.bonus))

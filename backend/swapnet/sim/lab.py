"""Simulation lab: replay a synthetic year many times and compare policies.

This runs in memory (not against FalkorDB) so hundreds of runs finish in minutes; it uses the
same generator, the same compatibility rules and the same optimiser as the live system.
All numbers are synthetic and measured by us; they are not claims about real patients.

    python -m swapnet.sim.lab --runs 20
"""
import argparse
import json
import math
import random
import statistics
import time
from concurrent.futures import ProcessPoolExecutor
from itertools import permutations

from swapnet import config
from swapnet.gen.generator import ABO_OK, Generator, abo_ok
from swapnet.optimiser.solver import Candidate, best_fallback, expected_transplants, solve

POLICIES = [
    ("alone_2way", "Each hospital alone", "2-way swaps only (today)"),
    ("shared_2way", "Shared pool", "2-way swaps only"),
    ("shared_3way_blind", "Shared + 3-way", "ignores test failures"),
    ("swapnet", "KindRed", "shared, 3-way, plans for failure, repairs live"),
]


# ---------------------------------------------------------------- compatibility model

class Pool:
    def __init__(self, params: dict, rng: random.Random):
        self.p = params
        self.rng = rng
        f = params["failure"]
        self.f = f

    def edge(self, a, b) -> tuple[bool, float, bool]:
        """(visible edge?, estimated p_success, true lab result negative?) for donor of a -> patient of b."""
        if not abo_ok(a.donor["abo"], b.patient["abo"]):
            return False, 0.0, False
        ab = {x["name"] for x in b.antibodies}
        typed = {x["name"] for x in a.antigens if x["locus"] not in a.donor["untyped_loci"]}
        if ab & typed:
            return False, 0.0, False
        full = {x["name"] for x in a.antigens}
        hidden_clash = bool(ab & full)
        base = 1 - (self.f["xm_positive_high_cpra"] if b.patient["cpra"] > 90 else self.f["xm_positive_low_cpra"])
        est = base * (1 - self.f["untyped_dq_extra"] * len(a.donor["untyped_loci"])) * (1 - self.f["offer_refusal"])
        return True, est, not hidden_clash

    def realise(self, a, b, true_neg: bool) -> bool:
        """Does this link actually reach surgery? Hidden antibody clashes always fail; otherwise
        random lab positives (by sensitisation) and refusals."""
        if not true_neg:
            return False
        xm = self.f["xm_positive_high_cpra"] if b.patient["cpra"] > 90 else self.f["xm_positive_low_cpra"]
        # The estimate already includes the chance of an unseen positive; part of it is the hidden clash above.
        if self.rng.random() < xm * 0.6:
            return False
        return self.rng.random() >= self.f["offer_refusal"]


def loops(ids: list[str], adj: dict, max_len: int, through: set | None = None) -> list[tuple]:
    out, idx = [], {p: i for i, p in enumerate(ids)}
    s = set(ids)
    for a in ids:
        for b in adj.get(a, {}):
            if b not in s or idx[b] <= idx[a]:
                continue
            if a in adj.get(b, {}):
                if not through or {a, b} & through:
                    out.append((a, b))
        if max_len >= 3:
            for b in adj.get(a, {}):
                if b not in s or idx[b] <= idx[a]:
                    continue
                for c in adj.get(b, {}):
                    if c not in s or idx[c] <= idx[a] or c == b:
                        continue
                    if a in adj.get(c, {}):
                        if not through or {a, b, c} & through:
                            out.append((a, b, c))
    return out


def candidates(ls: list[tuple], adj: dict) -> list[Candidate]:
    cs = []
    for l in ls:
        probs = [adj[l[i]][l[(i + 1) % len(l)]][0] for i in range(len(l))]
        c = Candidate(list(l), probs)
        if len(l) == 3:
            best_fallback(c, [[l[i], l[(i + 1) % 3], adj[l[(i + 1) % 3]][l[i]][0]]
                              for i in range(3) if l[i] in adj.get(l[(i + 1) % 3], {})])
        cs.append(c)
    return cs


# ---------------------------------------------------------------- one synthetic year

def run_year(policy: str, seed: int, weeks: int = 52, arrivals: float | None = None) -> dict:
    """One synthetic year, simulated day by day.

    A selected loop is not resolved instantly: its pairs are out of the pool for the offer and
    crossmatch stages (Ashlagi 2018 delay model), and anyone who leaves the pool meanwhile breaks
    it. Every policy runs a match once a week. The failure-aware policy also repairs on the day a
    failure is known; the others put released pairs back for the next weekly run. Lab results
    are physical facts, so a retested link gives the same answer under every policy."""
    params = config.params()
    arr = random.Random(seed)               # arrivals and departures: same for every policy
    rng = random.Random(seed * 7919 + 1)    # lab and refusal outcomes
    gen = Generator(seed)
    model = Pool(params, rng)
    codes = [h["code"] for h in config.hospitals()["hospitals"]]
    lam = (arrivals or params["arrivals_per_week"] * 3) / 7  # national pool: several centres' worth, per day
    t = params["timing"]
    delay = t["offer_days"] + t["crossmatch_days"]
    shared = policy != "alone_2way"
    max_len = 2 if policy in ("alone_2way", "shared_2way") else 3
    aware = policy == "swapnet"
    weights = config.policies()["matching"]["priority_bonus"]

    pairs, waiting, adj = {}, set(), {}
    arrived_at, leaves_at, done = {}, {}, []
    failed_before: set[str] = set()
    known: dict[tuple, bool] = {}            # (a, b) -> link reached surgery stage when tested
    pending: list[tuple[int, Candidate]] = []
    tx = tests_wasted = repaired = 0
    next_id = 1

    def bonus() -> dict[str, float]:
        if not aware:
            return {}
        return {p: (weights["blood_o_patient"] if pairs[p].patient["abo"] == "O" else 0)
                   + (weights["high_cpra"] if pairs[p].patient["cpra"] > 85 else 0)
                   + (weights["failed_before"] if p in failed_before else 0) for p in waiting}

    def link(a: str, b: str, day: int) -> bool:
        if leaves_at[a] <= day or leaves_at[b] <= day:
            return False
        if (a, b) not in known:
            known[(a, b)] = model.realise(pairs[a], pairs[b], adj[a][b][1])
        return known[(a, b)]

    def add(pr):
        pairs[pr.pair_id] = pr
        waiting.add(pr.pair_id)
        adj[pr.pair_id] = {}
        for q in list(waiting):
            if q == pr.pair_id:
                continue
            for a, b in ((pr.pair_id, q), (q, pr.pair_id)):
                ok, est, neg = model.edge(pairs[a], pairs[b])
                if ok:
                    adj[a][b] = (est, neg)

    def resolve(c: Candidate, day: int) -> tuple[list[str], list[str]]:
        """Lab results are in. Returns (pairs transplanted, pairs released back to the pool)."""
        nonlocal tests_wasted
        n = len(c.pairs)
        ok = [link(c.pairs[i], c.pairs[(i + 1) % n], day) for i in range(n)]
        if all(ok):
            return list(c.pairs), []
        tests_wasted += sum(ok)
        got: list[str] = []
        if aware and n == 3 and c.fallback:
            # the 2-way inside was tested alongside the loop, so it goes ahead with no new delay
            x, y, _ = c.fallback
            if ok[c.pairs.index(x)] and link(y, x, day):
                got = [x, y]
        # failure is remembered: the failed link is never proposed again
        for i in range(n):
            if not ok[i]:
                adj[c.pairs[i]].pop(c.pairs[(i + 1) % n], None)
        released = [p for p in c.pairs if p not in got and leaves_at[p] > day]
        failed_before.update(released)
        return got, released

    def select(ids: list[str], day: int, through: set | None = None) -> int:
        cs = candidates(loops(ids, adj, max_len, through=through), adj)
        if not cs:
            return 0
        res = solve(cs, bonus(), failure_aware=aware, time_limit=2)
        for c in res["chosen"]:
            for p in c.pairs:
                waiting.discard(p)
            c.meta["repair"] = through is not None
            pending.append((day + delay, c))
        return len(res["chosen"])

    days = weeks * 7
    for day in range(days):
        for _ in range(_poisson(arr, lam)):
            pr = gen.pairs(1, codes, start=next_id)[0]
            next_id += 1
            arrived_at[pr.pair_id] = day
            leaves_at[pr.pair_id] = day + _geometric(arr, params["departure_daily_hazard"])
            add(pr)
        for p in list(waiting):
            if leaves_at[p] <= day:
                waiting.discard(p)
        released_today = []
        for due, c in [x for x in pending if x[0] <= day]:
            pending.remove((due, c))
            got, released = resolve(c, day)
            tx += len(got)
            repaired += 1 if got and c.meta["repair"] else 0
            done += [(p, day) for p in got]
            released_today += released
        waiting.update(released_today)
        if day % t["match_run_every_days"] == 0:
            groups = [sorted(waiting)] if shared else [sorted(p for p in waiting if pairs[p].hospital == h) for h in codes]
            for ids in groups:
                select(ids, day)
        elif aware and released_today:  # repair live: only loops through the released pairs
            select(sorted(waiting), day, through=set(released_today))
    matched = {p for p, _ in done}
    o_total = [p for p in pairs if pairs[p].patient["abo"] == "O"]
    hs_total = [p for p in pairs if pairs[p].patient["cpra"] > 85]
    waits = [(d - arrived_at[p]) / 7 for p, d in done]
    return {
        "transplants": tx, "arrived": len(pairs),
        "o_matched_pct": 100 * len([p for p in o_total if p in matched]) / max(1, len(o_total)),
        "hs_matched_pct": 100 * len([p for p in hs_total if p in matched]) / max(1, len(hs_total)),
        "median_weeks": statistics.median(waits) if waits else None,
        "tests_wasted": tests_wasted, "loops_repaired": repaired,
    }


def _geometric(rng: random.Random, p: float) -> int:
    return int(math.log(1 - rng.random()) / math.log(1 - p)) + 1


def _poisson(rng: random.Random, lam: float) -> int:
    l, k, p = math.exp(-lam), 0, 1.0
    while True:
        p *= rng.random()
        if p <= l:
            return k
        k += 1


def ci95(xs: list[float]) -> tuple[float, float, float]:
    m = statistics.mean(xs)
    if len(xs) < 2:
        return m, m, m
    h = 1.96 * statistics.stdev(xs) / math.sqrt(len(xs))
    return round(m, 1), round(m - h, 1), round(m + h, 1)


# ---------------------------------------------------------------- validation against Saidman 2006

def saidman_us(n: int, seed: int) -> tuple[float, float]:
    """Saidman et al. 2006 generator with US inputs; matched share with 2-way and with 2+3-way."""
    rng = random.Random(seed)
    abo = {"O": 0.4814, "A": 0.3373, "B": 0.1428, "AB": 0.0385}
    pra = [(0.7, 0.05), (0.2, 0.45), (0.1, 0.90)]

    def pick(d):
        r, acc = rng.random(), 0
        for k, v in d.items():
            acc += v
            if r <= acc:
                return k
        return k

    ps = []
    while len(ps) < n:
        da, pa = pick(abo), pick(abo)
        r, acc, pr = rng.random(), 0, 0.05
        for share, x in pra:
            acc += share
            if r <= acc:
                pr = x
                break
        if pa in ABO_OK[da] and rng.random() >= pr:
            continue  # compatible with own donor: does not enter the pool
        ps.append((da, pa, pr))
    adj = {i: {} for i in range(n)}
    for i, j in permutations(range(n), 2):
        if ps[j][1] in ABO_OK[ps[i][0]] and rng.random() >= ps[j][2]:
            adj[i][j] = (1.0, True)
    ids = list(range(n))
    out = []
    for k in (2, 3):
        cs = candidates(loops(ids, adj, k), adj)
        res = solve(cs, failure_aware=False, time_limit=10)
        out.append(100 * res["planned_tx"] / n)
    return out[0], out[1]


def main(runs: int = 20) -> dict:
    t0 = time.time()
    results = {}
    for key, title, sub in POLICIES:
        with ProcessPoolExecutor() as ex:
            rs = list(ex.map(run_year, [key] * runs, range(1, runs + 1)))
        results[key] = {
            "title": title, "subtitle": sub,
            "transplants": ci95([r["transplants"] for r in rs]),
            "o_matched_pct": ci95([r["o_matched_pct"] for r in rs]),
            "hs_matched_pct": ci95([r["hs_matched_pct"] for r in rs]),
            "median_weeks": ci95([r["median_weeks"] or 0 for r in rs]),
            "tests_wasted": ci95([r["tests_wasted"] for r in rs]),
            "loops_repaired": ci95([r["loops_repaired"] for r in rs]),
            "arrived": ci95([r["arrived"] for r in rs]),
        }
        print(key, results[key]["transplants"], flush=True)
    val = [saidman_us(100, s) for s in range(1, 11)]
    validation = {
        "saidman_2way": ci95([v[0] for v in val]), "saidman_3way": ci95([v[1] for v in val]),
        "published_2way": 49.8, "published_3way": 59.8,
    }
    out = {"runs": runs, "weeks": 52, "policies": [k for k, _, _ in POLICIES], "results": results,
           "validation": validation, "seconds": round(time.time() - t0),
           "note": "Synthetic. Measured by the KindRed simulator; not a claim about real patients."}
    p = config.DATA / "generated" / "sim_results.json"
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(out, indent=2))
    return out


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--runs", type=int, default=20)
    print(json.dumps(main(ap.parse_args().runs)["validation"], indent=2))

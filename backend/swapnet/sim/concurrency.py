"""Concurrency test (Track 2: high-concurrency reads and writes), measured and published.

In a national pool, every hospital's intake agent publishes families while the matching agent searches the same graph.
This test does that on purpose, in its own scratch graph (`bench_concurrency`, never the demo graph), with the real
named queries:

1. Throughput. N intake agents (threads, each with its own FalkorDB connection) publish the same set of new families,
   split between them, at once (so every level ends with the same pool and only the concurrency differs): Q01
   (publish, with the optimistic version check) then Q02 (build the family's links). Meanwhile two matcher readers run
   the whole-pool 2- and 3-way loop search (Q04, Q05) again and again. Afterwards every family must be in the graph
   exactly once, at version 1: no write lost.
2. Reads under writes. The search's cost grows steeply with the pool (a bigger pool has many more 3-way loops), so its
   latency is compared on a pool of fixed size: two matchers searching with no writer, then the same two while N agents
   keep updating their own families (Q01 with the version check, then Q02 rebuilding their links).
3. Contention. N agents update the same family at the same moment. Each reads the version and writes through Q01 with
   it; a write whose version is stale is refused (a conflict) and retried, so no update is lost. The control is the
   same work as a plain read-then-write without the check, which loses updates.

FalkorDB runs one write query at a time per graph and reads in parallel, so writes queue rather than interleave; the
version check is what stops a stale read from overwriting a newer write.

    python -m swapnet.sim.concurrency            # writes data/generated/concurrency.json
"""
import argparse
import json
import os
import platform
import statistics
import threading
import time
from concurrent.futures import ThreadPoolExecutor

from falkordb import FalkorDB

from swapnet import config, organs
from swapnet.graph import db, publish

GRAPH = "bench_concurrency"
KIDNEY = organs.get("kidney")
_TEXT = {n: db.query_text(n) for n in ("Q01_upsert_pair", "Q02_build_edges_for_pair", "Q04_two_way_loops", "Q05_three_way_loops")}
LOOPS = {"ids": None, "organ": "kidney"}


def _graph():
    """A connection of this agent's own, as separate agents would have."""
    return FalkorDB(host=config.FALKORDB_HOST, port=config.FALKORDB_PORT).select_graph(GRAPH)


def _timed(fn, *args) -> tuple[list | None, float, str | None]:
    t0 = time.perf_counter()
    try:
        rows = fn(*args).result_set
        err = None
    except Exception as e:  # a timeout or a full queue is a result here, not a crash
        rows, err = None, str(e).split("\n")[0][:120]
    return rows, (time.perf_counter() - t0) * 1000, err


def _pct(xs: list[float], q: float) -> float | None:
    if not xs:
        return None
    s = sorted(xs)
    return round(s[min(len(s) - 1, int(round(q * (len(s) - 1))))], 1)


def _lat(xs: list[float]) -> dict:
    return {"n": len(xs), "p50_ms": _pct(xs, 0.5), "p95_ms": _pct(xs, 0.95), "max_ms": round(max(xs), 1) if xs else None}


# ---------------------------------------------------------------- setup

def setup(base: int, fresh: int, seed: int) -> tuple[list, list]:
    """A fresh scratch graph with `base` published families and their links; returns them and `fresh` more to publish."""
    if GRAPH in db.db().list_graphs():
        db.db().select_graph(GRAPH).delete()
    for stmt in db.query_text("Q00_schema").split(";"):
        s = "\n".join(l for l in stmt.strip().splitlines() if not l.strip().startswith("//")).strip()
        if s:
            try:
                db.raw(s, graph=GRAPH)
            except Exception as e:
                if "already" not in str(e).lower():
                    raise
    pool = KIDNEY.background(base + fresh, KIDNEY.hospitals(), seed)
    g = db.db().select_graph(GRAPH)
    for pr in pool[:base]:
        g.query(_TEXT["Q01_upsert_pair"], publish.exchange_params(pr))
    for pr in pool[:base]:
        g.query(_TEXT["Q02_build_edges_for_pair"], {"pair_id": pr.pair_id, **KIDNEY.edge_params()})
    return pool[:base], pool[base:]


def _search(g) -> tuple[float, str | None, int]:
    """One matcher pass: every 2- and 3-way loop in the kidney pool (read-only, as the matching agent runs it)."""
    two, ms2, e2 = _timed(g.ro_query, _TEXT["Q04_two_way_loops"], LOOPS)
    three, ms3, e3 = _timed(g.ro_query, _TEXT["Q05_three_way_loops"], LOOPS)
    return ms2 + ms3, e2 or e3, len(two or []) + len(three or [])


def _idle_reads(n: int, readers: int = 1) -> tuple[list[float], list[str], int]:
    """`n` searches by each of `readers` matchers at once, with no writer: the baseline for the same number of readers."""
    ms, errs, loops = [], [], [0]
    lock = threading.Lock()

    def one() -> None:
        g = _graph()
        for _ in range(n):
            t, e, k = _search(g)
            with lock:
                (errs.append(e) if e else ms.append(t))
                loops[0] = k

    threads = [threading.Thread(target=one) for _ in range(readers)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    return ms, errs, loops[0]


# ---------------------------------------------------------------- 1. throughput

def throughput(writers: int, families: int, base: int, seed: int, readers: int = 2) -> dict:
    """`writers` intake agents publish `families` new families between them, all at once, while `readers` matchers search."""
    _, fresh = setup(base, families, seed)
    done = threading.Event()
    w_ms, w_err, r_ms, r_err, edges = [], [], [], [], []
    lock = threading.Lock()

    def writer(batch: list) -> None:
        g = _graph()
        for pr in batch:
            t0 = time.perf_counter()
            _, _, e1 = _timed(g.query, _TEXT["Q01_upsert_pair"], publish.exchange_params(pr))
            rows, _, e2 = _timed(g.query, _TEXT["Q02_build_edges_for_pair"], {"pair_id": pr.pair_id, **KIDNEY.edge_params()})
            with lock:
                if e1 or e2:
                    w_err.append(e1 or e2)
                else:
                    w_ms.append((time.perf_counter() - t0) * 1000)
                    edges.append(rows[0][0] if rows else 0)

    def reader() -> None:
        g = _graph()
        while not done.is_set():
            t, e, _ = _search(g)
            with lock:
                (r_err.append(e) if e else r_ms.append(t))

    batches = [fresh[i::writers] for i in range(writers)]
    rs = [threading.Thread(target=reader, daemon=True) for _ in range(readers)]
    for t in rs:
        t.start()
    t0 = time.perf_counter()
    with ThreadPoolExecutor(max_workers=writers) as ex:
        list(ex.map(writer, batches))
    wall = time.perf_counter() - t0
    done.set()
    for t in rs:
        t.join()
    # Nothing lost: every family published exactly once, at version 1.
    check = db.raw("MATCH (p:Pair) WHERE p.pair_id IN $ids RETURN count(p) AS n, sum(CASE WHEN p.version = 1 THEN 1 ELSE 0 END) AS v1",
                   {"ids": [p.pair_id for p in fresh]}, graph=GRAPH)[0]
    total = db.raw("MATCH (p:Pair) RETURN count(p) AS n", graph=GRAPH)[0]["n"]
    published = len(w_ms)
    return {
        "writers": writers, "readers": readers, "families": len(fresh), "published": published, "seconds": round(wall, 2),
        "families_per_s": round(published / wall, 1), "write_queries_per_s": round(2 * published / wall, 1),
        "publish_latency": _lat(w_ms), "links_built": sum(edges), "searches_during_load": len(r_ms),
        "pool_before": base, "pool_after": total,
        "errors": {"write": len(w_err), "read": len(r_err), "examples": sorted(set(w_err + r_err))[:3]},
        "lost_writes": len(fresh) - check["n"], "all_at_version_1": check["v1"] == len(fresh),
    }


# ---------------------------------------------------------------- 2. reads under writes

def reads_under_writes(writers: int, seconds: float, base: int, seed: int, readers: int = 2) -> dict:
    """The matcher's loop search on a pool of fixed size: alone, then while `writers` agents keep updating families of
    their own (no two agents share a family), then alone again."""
    pool, _ = setup(base, 0, seed)
    idle, idle_err, loops = _idle_reads(5, readers)  # the same matchers, no writers
    done = threading.Event()
    w_ms, w_err, r_ms, r_err = [], [], [], []
    lock = threading.Lock()

    def writer(batch: list) -> None:
        g = _graph()
        while not done.is_set():
            for pr in batch:
                if done.is_set():
                    return
                t0 = time.perf_counter()
                v = g.ro_query("MATCH (p:Pair {pair_id: $id}) RETURN p.version", {"id": pr.pair_id}).result_set[0][0]
                rows, _, e1 = _timed(g.query, _TEXT["Q01_upsert_pair"], publish.exchange_params(pr, expected_version=v))
                _, _, e2 = _timed(g.query, _TEXT["Q02_build_edges_for_pair"], {"pair_id": pr.pair_id, **KIDNEY.edge_params()})
                with lock:
                    if e1 or e2 or not rows:
                        w_err.append(e1 or e2 or "version conflict")
                    else:
                        w_ms.append((time.perf_counter() - t0) * 1000)

    def reader() -> None:
        g = _graph()
        while not done.is_set():
            t, e, _ = _search(g)
            with lock:
                (r_err.append(e) if e else r_ms.append(t))

    threads = [threading.Thread(target=writer, args=(pool[i::writers],), daemon=True) for i in range(writers)]
    threads += [threading.Thread(target=reader, daemon=True) for _ in range(readers)]
    for t in threads:
        t.start()
    time.sleep(seconds)
    done.set()
    for t in threads:
        t.join()
    after, after_err, _ = _idle_reads(5, readers)
    i, u = _lat(idle), _lat(r_ms)
    return {
        "writers": writers, "readers": readers, "seconds": seconds, "pool": base, "loops_in_pool": loops,
        "updates": len(w_ms), "updates_per_s": round(len(w_ms) / seconds, 1), "update_latency": _lat(w_ms),
        "search_idle": i, "search_during_writes": u, "search_idle_after": _lat(after),
        "slowdown_p50": round(u["p50_ms"] / i["p50_ms"], 2) if u["p50_ms"] and i["p50_ms"] else None,
        "errors": {"write": len(w_err), "read": len(r_err) + len(idle_err) + len(after_err),
                   "examples": sorted(set(w_err + r_err + idle_err + after_err))[:3]},
    }


# ---------------------------------------------------------------- 3. contention

def contention(agents: int, updates: int, base: int, seed: int, max_tries: int = 200) -> dict:
    """`agents` agents each make `updates` changes to the same family at the same moment."""
    pool, _ = setup(base, 0, seed)
    target = pool[0]
    start = db.raw("MATCH (p:Pair {pair_id: $id}) SET p.counter = 0 RETURN p.version AS v", {"id": target.pair_id}, graph=GRAPH)[0]["v"]
    stats = {"ok": 0, "conflicts": 0, "gave_up": 0, "errors": 0}
    lat: list[float] = []
    lock = threading.Lock()
    barrier = threading.Barrier(agents)

    def versioned(i: int) -> None:
        g = _graph()
        barrier.wait()
        for k in range(updates):
            t0 = time.perf_counter()
            for _ in range(max_tries):
                v = g.ro_query("MATCH (p:Pair {pair_id: $id}) RETURN p.version", {"id": target.pair_id}).result_set[0][0]
                params = publish.exchange_params(target, expected_version=v)
                params["pair"] = {**params["pair"], "priority": round(0.01 * (i * updates + k), 2), "updated_by": f"agent-{i}"}
                rows, _, err = _timed(g.query, _TEXT["Q01_upsert_pair"], params)
                with lock:
                    if err:
                        stats["errors"] += 1
                    elif rows:
                        stats["ok"] += 1
                        lat.append((time.perf_counter() - t0) * 1000)
                        break
                    else:
                        stats["conflicts"] += 1  # someone else wrote first: the stale write was refused
            else:
                with lock:
                    stats["gave_up"] += 1

    def naive(i: int) -> None:
        """The control: read, then write what was read plus one, with no version check."""
        g = _graph()
        barrier.wait()
        for _ in range(updates):
            c = g.ro_query("MATCH (p:Pair {pair_id: $id}) RETURN p.counter", {"id": target.pair_id}).result_set[0][0]
            g.query("MATCH (p:Pair {pair_id: $id}) SET p.counter = $c", {"id": target.pair_id, "c": c + 1})

    t0 = time.perf_counter()
    with ThreadPoolExecutor(max_workers=agents) as ex:
        list(ex.map(versioned, range(agents)))
    wall = time.perf_counter() - t0
    end = db.raw("MATCH (p:Pair {pair_id: $id}) RETURN p.version AS v", {"id": target.pair_id}, graph=GRAPH)[0]["v"]
    with ThreadPoolExecutor(max_workers=agents) as ex:
        list(ex.map(naive, range(agents)))
    counter = db.raw("MATCH (p:Pair {pair_id: $id}) RETURN p.counter AS c", {"id": target.pair_id}, graph=GRAPH)[0]["c"]
    wanted = agents * updates
    return {
        "agents": agents, "updates_each": updates, "updates_wanted": wanted, "seconds": round(wall, 2),
        "updates_applied": stats["ok"], "conflicts_caught": stats["conflicts"], "gave_up": stats["gave_up"], "errors": stats["errors"],
        "lost_updates": wanted - (end - start), "version_check_ok": end - start == stats["ok"],
        "update_latency": _lat(lat),
        "control_without_check": {"updates_wanted": wanted, "updates_kept": counter, "lost_updates": wanted - counter},
    }


# ---------------------------------------------------------------- run and publish

def _falkordb() -> dict:
    mods = db.db().connection.execute_command("MODULE", "LIST")
    graph = next((dict(zip(m[::2], m[1::2])) for m in mods if dict(zip(m[::2], m[1::2])).get("name") in ("graph", b"graph")), {})
    v = int(graph.get("ver", 0))
    args = graph.get("args") or []
    return {"version": f"{v // 10000}.{v // 100 % 100}.{v % 100}",
            "settings": dict(zip(args[::2], args[1::2]))}


def run(writers=(1, 2, 4, 8, 16), families: int = 96, agents=(2, 8, 16), updates: int = 10, base: int = 150,
        seed: int = 11, seconds: float = 8, out: bool = True) -> dict:
    t0 = time.time()
    res = {
        "what": "Concurrent intake agents publishing families while the matcher searches; concurrent updates to one family.",
        "falkordb": _falkordb(),
        "machine": {"cpus": os.cpu_count(), "os": platform.system(), "python": platform.python_version()},
        "base_pool": base, "new_families": families, "graph": GRAPH,
        "throughput": [throughput(w, families, base, seed) for w in writers],
        "reads_under_writes": [reads_under_writes(w, seconds, base, seed) for w in writers],
        "contention": [contention(a, updates, base, seed) for a in agents],
        "measured_at": int(time.time() * 1000),
        "note": "Synthetic families in a scratch graph. FalkorDB in Docker on one laptop; agents are threads with their own connections.",
    }
    res["seconds"] = round(time.time() - t0)
    db.db().select_graph(GRAPH).delete()
    if out:
        p = config.DATA / "generated" / "concurrency.json"
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(json.dumps(res, indent=2) + "\n", encoding="utf-8", newline="\n")
    return res


def table(res: dict) -> str:
    lines = ["writers | families/s | publish p50/p95 ms | searches meanwhile | errors | lost"]
    for t in res["throughput"]:
        lines.append(f"{t['writers']:>7} | {t['families_per_s']:>10} | {t['publish_latency']['p50_ms']}/{t['publish_latency']['p95_ms']} | "
                     f"{t['searches_during_load']:>18} | {t['errors']['write'] + t['errors']['read']} | {t['lost_writes']}")
    lines.append("writers | updates/s | search p50/p95 ms alone → during writes | slowdown | errors")
    for t in res["reads_under_writes"]:
        lines.append(f"{t['writers']:>7} | {t['updates_per_s']:>9} | {t['search_idle']['p50_ms']}/{t['search_idle']['p95_ms']} → "
                     f"{t['search_during_writes']['p50_ms']}/{t['search_during_writes']['p95_ms']} | {t['slowdown_p50']}x | "
                     f"{t['errors']['write'] + t['errors']['read']}")
    lines.append("agents | updates | conflicts caught | lost with check | lost without check")
    for c in res["contention"]:
        lines.append(f"{c['agents']:>6} | {c['updates_wanted']:>7} | {c['conflicts_caught']:>16} | {c['lost_updates']:>15} | "
                     f"{c['control_without_check']['lost_updates']}")
    return "\n".join(lines)


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--quick", action="store_true", help="small run, nothing written")
    a = ap.parse_args()
    r = run(writers=(1, 4), families=8, agents=(4,), updates=3, base=40, seconds=2, out=False) if a.quick else run()
    print(table(r))

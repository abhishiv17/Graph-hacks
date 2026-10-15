"""The concurrency test (swapnet/sim/concurrency.py), small enough for the suite: concurrent publishing loses no family,
and the version check refuses stale writes so no update to a shared family is lost. Needs a running FalkorDB; works in
its own scratch graph, never the demo graph."""
from swapnet.graph import db
from swapnet.sim import concurrency


def test_concurrent_agents_lose_no_write():
    r = concurrency.run(writers=(3,), families=6, agents=(4,), updates=3, base=30, seconds=1.5, out=False)
    t, w, c = r["throughput"][0], r["reads_under_writes"][0], r["contention"][0]
    assert t["published"] == 6 and t["lost_writes"] == 0 and t["all_at_version_1"]
    assert t["errors"]["write"] == 0 and t["searches_during_load"] > 0  # the matcher kept searching while agents wrote
    assert w["updates"] > 0 and w["search_during_writes"]["n"] > 0 and w["errors"]["write"] == 0
    assert c["updates_applied"] == 12 and c["lost_updates"] == 0 and c["version_check_ok"]
    assert concurrency.GRAPH not in db.db().list_graphs()  # the scratch graph is removed afterwards

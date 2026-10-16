"""The agents' own clock. Every few seconds the watch looks for work nobody pressed a button for:
held offers whose lab test is already back, overdue lab tests, committee deadlines closing in,
demo patients' new lab readings (agents/health.py),
and families waiting to be re-matched. Each agent acts in its own role; every action is an event
and a Decision in the graph, so the audit trail shows it.

KINDRED_WATCH=0 turns it off; KINDRED_WATCH_SECONDS sets the interval (default 30). Another process (the test suite)
can pause every watch sharing this FalkorDB by setting the PAUSE_KEY key; it expires on its own.
"""
import os
import threading
import time

from swapnet.agents import core, health
from swapnet.graph import db

INTERVAL = float(os.getenv("KINDRED_WATCH_SECONDS", "30"))
ENABLED = os.getenv("KINDRED_WATCH", "1") != "0"
# Most committee chases per sweep, so a large pool doesn't flood the feed.
MAX_CHASES = 1

PAUSE_KEY = "kindred:watch:paused"

state = {"enabled": ENABLED, "interval_s": INTERVAL, "sweeps": 0, "last_at": None, "last_actions": [], "running": False, "worlds": {}}
_stop = threading.Event()


def _stale_holds() -> list[str]:
    """Holds whose incoming test is already negative (e.g. recorded while the hold was being written)."""
    rows = db.raw("""MATCH (o:Offer {response: 'hold'})-[:FOR]->(l:Loop), (o)-[:TO]->(p:Pair)
                     MATCH (x:Crossmatch {result: 'negative'})-[:IN]->(l), (x)-[:PATIENT_OF]->(p)
                     RETURN DISTINCT l.loop_id AS l, p.pair_id AS p""")
    out = []
    for r in rows:
        if core.intake_for(r["p"]).resolve_hold(r["l"], r["p"]):
            out.append(f"Hold released for {r['p']} in {r['l']}")
    return out


def _committee() -> list[str]:
    loops = db.raw("""MATCH (l:Loop) WHERE l.status IN ['offered', 'testing', 'committee', 'locked']
                      RETURN l.loop_id AS id ORDER BY l.created_at""")
    clerk, out = core.CommitteeClerk(), []
    ranked = []
    for r in loops:
        rd = clerk.readiness(r["id"])
        if rd["blocking"]:
            b = next(x for x in rd["pairs"] if x["pair_id"] == rd["blocking"])
            ranked.append((b["days_left"], r["id"]))
    for _, loop_id in sorted(ranked):
        if len(out) >= MAX_CHASES:
            break
        step = clerk.chase(loop_id, auto=True)
        if step:
            out.append(f"{step['step']}: {step['pair_id']} ({loop_id})")
    return out


def _rematch() -> list[str]:
    ids = [r["p"] for r in db.raw("MATCH (p:Pair {status: 'waiting', needs_rematch: true}) RETURN p.pair_id AS p")]
    if not ids:
        return []
    loops = core.MatchingAgent().rematch(ids)
    return [f"Re-matched into {l['loop_id']}" for l in loops] or [f"Checked {len(ids)} waiting famil{'y' if len(ids) == 1 else 'ies'}"]


def sweep() -> dict:
    """One pass over every duty. Skips if a reset or another action holds the graph, or the watch is paused."""
    if paused():
        return {"skipped": True, "paused": True, **state}
    if not core.LOCK.acquire(blocking=False):
        return {"skipped": True, **state}
    try:
        state["running"] = True
        from swapnet import worlds
        # The shared demo and every live private copy: each world's agents keep working on their own.
        for w in ["", *worlds.active()]:
            with db.in_world(w):
                actions = []
                for fn in (_stale_holds, core.CrossmatchCoordinator().check_overdue, _committee, health.sweep, _rematch):
                    try:
                        actions += fn()
                    except Exception as e:  # one failing duty must not stop the others
                        db.event("Watch", f"{fn.__name__} failed: {type(e).__name__}", "warn")
                state["worlds"][w] = actions
        if state["sweeps"] % 20 == 0:
            worlds.cleanup()
        state.update(sweeps=state["sweeps"] + 1, last_at=int(time.time() * 1000), last_actions=state["worlds"].get("", []))
        return {"skipped": False, **state}
    finally:
        state["running"] = False
        core.LOCK.release()


def paused() -> bool:
    try:
        return bool(db.db().connection.exists(PAUSE_KEY))
    except Exception:
        return False


def pause(seconds: int = 900) -> None:
    db.db().connection.set(PAUSE_KEY, "1", ex=seconds)


def resume() -> None:
    db.db().connection.delete(PAUSE_KEY)


def _loop() -> None:
    _stop.wait(5)  # let the API finish starting
    while not _stop.is_set():
        try:
            sweep()
        except Exception:
            pass  # the graph may be mid-reset; try again next tick
        _stop.wait(INTERVAL)


def start() -> None:
    if ENABLED and not any(t.name == "kindred-watch" for t in threading.enumerate()):
        threading.Thread(target=_loop, name="kindred-watch", daemon=True).start()


def stop() -> None:
    _stop.set()

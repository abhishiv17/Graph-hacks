"""The agents' own clock. Every few seconds the watch looks for work nobody pressed a button for:
held offers whose lab test is already back, overdue lab tests, committee deadlines closing in,
demo patients' new lab readings (agents/health.py),
and families waiting to be re-matched. Each agent acts in its own role; every action is an event
and a Decision in the graph, so the audit trail shows it.

KINDRED_WATCH=0 turns it off; KINDRED_WATCH_SECONDS sets the interval (default 30). Another process (the test suite)
can pause every watch sharing this FalkorDB by setting the PAUSE_KEY key; it expires on its own.

The labs answer on their own too: tests out for KINDRED_LAB_SECONDS (default 60) get their results. Autoplay
(off unless someone turns it on, for KINDRED_AUTOPLAY_MINUTES) moves one demo patient a week on every sweep, so every
agent gets work while a visitor just watches.
"""
import os
import threading
import time
from functools import lru_cache

from swapnet.agents import core, health
from swapnet.graph import db

INTERVAL = float(os.getenv("KINDRED_WATCH_SECONDS", "30"))
ENABLED = os.getenv("KINDRED_WATCH", "1") != "0"
# Most committee chases per sweep, so a large pool doesn't flood the feed.
MAX_CHASES = 1
LAB_SECONDS = float(os.getenv("KINDRED_LAB_SECONDS", "60"))
AUTOPLAY_MINUTES = float(os.getenv("KINDRED_AUTOPLAY_MINUTES", "15"))

PAUSE_KEY = "kindred:watch:paused"

# worlds: each world's last actions. autoplay: world -> when it turns itself off (ms). busy: world -> when a
# "run a week" round started (ms), while it runs.
state = {"enabled": ENABLED, "interval_s": INTERVAL, "sweeps": 0, "last_at": None, "last_actions": [], "running": False,
         "worlds": {}, "autoplay": {}, "busy": {}}
_turn: dict[str, int] = {}
_stop = threading.Event()


def _ms() -> int:
    return int(time.time() * 1000)


@lru_cache
def _story_pairs() -> tuple[str, ...]:
    """Families whose swaps a person (the demo story) or the coordinator agent (the demo patients) tests on cue."""
    from swapnet import personas, scenario
    return (*scenario.scripted(), *scenario.scripted_liver(), *(personas.get(p)["pair_id"] for p in personas.ids()))


def _lab_returns() -> list[str]:
    """The (simulated) labs send results back without anyone pressing Run lab tests: the swap whose tests have been
    out longest, once they are LAB_SECONDS old, one swap per sweep. A positive result breaks the link and the matching
    agent repairs around it, exactly as when a person runs the tests."""
    rows = db.raw("""MATCH (x:Crossmatch {result: 'pending'})-[:IN]->(l:Loop {status: 'testing'})
                     WHERE x.requested_at < $cut
                     RETURN l.loop_id AS l, min(x.requested_at) AS at ORDER BY at""",
                  {"cut": _ms() - int(LAB_SECONDS * 1000)})
    if not rows:
        return []
    story = {r["l"] for r in db.raw("MATCH (p:Pair)-[:IN_LOOP]->(l:Loop) WHERE p.pair_id IN $keep RETURN DISTINCT l.loop_id AS l",
                                    {"keep": list(_story_pairs())})}
    loop_id = next((r["l"] for r in rows if r["l"] not in story), None)
    if not loop_id:
        return []
    res = core.CrossmatchCoordinator().run_lab(loop_id)
    failed = [r for r in res if r["result"] == "positive"]
    return [f"Lab results back for {loop_id}: " + (f"{failed[0]['a']} → {failed[0]['b']} failed" if failed else f"{len(res)} passed")]


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
                for fn in (_stale_holds, _lab_returns, core.CrossmatchCoordinator().check_overdue, _committee, health.sweep, _rematch):
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


def _advance(pid: str) -> str | None:
    """One simulated week for a demo patient, the same as pressing Next week; a finished journey starts again. None if
    someone else is moving that journey right now, or the patients aren't loaded."""
    from swapnet import personas
    lock = personas.journey_lock(pid)
    if not lock.acquire(blocking=False):
        return None
    try:
        with core.LOCK:
            try:
                return f"{pid}: week {health.advance(pid)['week']}"
            except health.EndOfJourney:
                personas.reset(pid)
                return f"{pid}: journey replayed from the start"
    except Exception:
        return None  # not seeded yet, or mid-reset
    finally:
        lock.release()


def run_week(w: str) -> bool:
    """Run the agents through one simulated week in world `w`, in the background: every demo patient moves on a week,
    then the watch sweeps. False if a round is already running there."""
    from swapnet import personas
    if state["busy"].get(w):
        return False
    state["busy"][w] = _ms()

    def go() -> None:
        try:
            with db.in_world(w):
                for pid in personas.ids():
                    _advance(pid)
            sweep()
        finally:
            state["busy"].pop(w, None)

    threading.Thread(target=go, name="kindred-run-week", daemon=True).start()
    return True


def autoplay(w: str, on: bool, minutes: float | None = None) -> dict:
    """Turn autoplay on or off for world `w`. It turns itself off after `minutes` (default AUTOPLAY_MINUTES)."""
    if on:
        state["autoplay"][w] = _ms() + int(60_000 * min(60.0, max(1.0, minutes or AUTOPLAY_MINUTES)))
    else:
        state["autoplay"].pop(w, None)
    return {"autoplay_until": state["autoplay"].get(w)}


def _autoplay_tick() -> None:
    """Each world with autoplay on: the next demo patient, in turn, moves on a week."""
    from swapnet import personas, worlds
    live = set(worlds.active())
    for w, until in list(state["autoplay"].items()):
        if _ms() > until or (w and w not in live):
            state["autoplay"].pop(w, None)
            continue
        if state["busy"].get(w):
            continue
        with db.in_world(w):
            ids = personas.ids()
            _turn[w] = _turn.get(w, -1) + 1
            _advance(ids[_turn[w] % len(ids)])


def _loop() -> None:
    _stop.wait(5)  # let the API finish starting
    while not _stop.is_set():
        try:
            sweep()
            if not paused():
                _autoplay_tick()
        except Exception:
            pass  # the graph may be mid-reset; try again next tick
        _stop.wait(INTERVAL)


def start() -> None:
    if ENABLED and not any(t.name == "kindred-watch" for t in threading.enumerate()):
        threading.Thread(target=_loop, name="kindred-watch", daemon=True).start()


def stop() -> None:
    _stop.set()

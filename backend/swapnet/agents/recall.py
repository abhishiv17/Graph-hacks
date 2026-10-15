"""What an agent read from memory before it acted (Track 2: shared memory, visibly used).

Each agent step lists the memories it used, which agent wrote them, and what it did with them, so the coordination is
visible: the health watch's finding is the coordinator's input, the crossmatch coordinator's failed test is the
matching agent's exclusion. The list is stored with the step (on its Finding or Decision), never recomputed later.
"""
from swapnet.graph import db

# Who writes each kind of Finding in a patient's memory graph (agents/health.py, agents/coordinator.py).
FINDING_WRITER = {"reading": "Health watch", "stage_change": "Health watch", "check": "Health watch",
                  "decision": "Coordinator agent", "case": "Coordinator agent", "world": "Hospitals (simulated)",
                  "baseline": "Hospital records"}


def item(memory: str, kind: str, written_by: str, n: int, used: str, detail: list[str] | None = None) -> dict:
    """One memory read: `n` items of `memory` (episodic, semantic, procedural or shared), who wrote them, how they were used."""
    return {"memory": memory, "kind": kind, "written_by": written_by, "n": n, "used": used, "detail": (detail or [])[:4]}


def who(names) -> str:
    """Writers as one phrase: "A", "A and B", "A, B and C"."""
    n = sorted(set(names))
    return n[0] if len(n) == 1 else ", ".join(n[:-1]) + " and " + n[-1]


def line(r: dict) -> str:
    return f"Read {r['n']} {r['memory']} (from {r['written_by']}): {r['used']}"


def failures(ids: list[str] | None, scope: str) -> dict:
    """The failure memory around `ids` (or the whole pool): links the crossmatch coordinator saw fail. Searches skip
    them (they only walk live links) and the families whose test failed get a priority bonus."""
    rows = db.run("Q54_failure_memory_around", {"ids": ids})
    families = {r["patient_pair"] for r in rows}
    used = ("none to skip" if not rows else
            f"{'that link is' if len(rows) == 1 else 'those links are'} skipped; "
            f"{len(families)} {'family gets' if len(families) == 1 else 'families get'} priority for an earlier failed test")
    return item(f"failed-link memor{'y' if len(rows) == 1 else 'ies'} {scope}", "episodic", "Crossmatch coordinator",
                len(rows), used, [f"{r['donor_pair']} → {r['patient_pair']} ({r['cause']})" for r in rows])

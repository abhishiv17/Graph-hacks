"""Private demo copies ("worlds"): each visitor can start their own copy of the whole demo, so two judges never move the
same patient's journey. A world is a set of FalkorDB graphs with the world's id as a prefix (db.name), which is the
one-graph-per-tenant pattern: isolation doesn't depend on remembering a filter. The registry is a key per world in the
same FalkorDB server, with a time-to-live: a copy nobody has used for TTL seconds expires and its graphs are deleted."""
import json
import os
import secrets
import time

from swapnet.graph import db

PREFIX = "kindred:world:"
TTL = int(os.getenv("KINDRED_WORLD_TTL", str(6 * 3600)))
MAX = int(os.getenv("KINDRED_MAX_WORLDS", "20"))
_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"  # no 0/o or 1/l/i, so a code reads out loud


def _r():
    return db.db().connection


def valid(wid: str) -> bool:
    return bool(wid) and wid.startswith("w") and 4 <= len(wid) <= 12 and all(c in _ALPHABET for c in wid[1:])


def active() -> list[str]:
    return sorted(k.decode()[len(PREFIX):] if isinstance(k, bytes) else k[len(PREFIX):] for k in _r().scan_iter(f"{PREFIX}*"))


def touch(wid: str) -> bool:
    """Keep a world alive while it is being used. False if it doesn't exist (or has expired)."""
    return valid(wid) and bool(_r().expire(f"{PREFIX}{wid}", TTL))


def info(wid: str) -> dict | None:
    raw = _r().get(f"{PREFIX}{wid}")
    if not raw:
        return None
    return {"id": wid, **json.loads(raw), "expires_in_s": _r().ttl(f"{PREFIX}{wid}")}


def cleanup() -> list[str]:
    """Delete the graphs of worlds whose key has expired."""
    live = set(active())
    gone = sorted({g.split("__", 1)[0] for g in db.db().list_graphs() if "__" in g} - live)
    for w in gone:
        if valid(w):
            db.drop_world(w)
    return gone


class Full(RuntimeError):
    pass


def create() -> dict:
    """Make a new private copy and load the demo into it (the same scenario as Restart demo)."""
    from swapnet import scenario
    cleanup()
    if len(active()) >= MAX:
        raise Full(f"{MAX} private copies are already running; use the shared demo or try again later")
    wid = "w" + "".join(secrets.choice(_ALPHABET) for _ in range(5))
    _r().set(f"{PREFIX}{wid}", json.dumps({"created": int(time.time() * 1000)}), ex=TTL)
    with db.in_world(wid):
        scenario.load()
    return info(wid)


def delete(wid: str) -> None:
    _r().delete(f"{PREFIX}{wid}")
    db.drop_world(wid)

"""Chats about one patient (Kin on a patient's or family's page, and the patient page's own chat).

Each chat lives in its own graph (chat_<subject>), so it's the same from any browser and survives Replay and Restart
demo. A new chat starts with a few questions already answered from graph data (no language model), so a visitor sees
straight away that the conversation is about this one patient. Questions that name another family are turned away
before any model is asked."""
import re
import time

from swapnet import explore, personas
from swapnet.agents import health
from swapnet.graph import db

_ID = re.compile(r"\bP-\d{4}\b", re.IGNORECASE)


def subject(key: str) -> dict | None:
    """A demo patient ("sunita") or any family ("P-0154"): who the chat is about."""
    p = personas.get(key)
    if p:
        return {"key": key, "pair_id": p["pair_id"], "name": p["name"], "first": p["name"].split()[0], "persona": key}
    pid = key.upper()
    r = db.raw("MATCH (q:Pair {pair_id: $p})-[:REGISTERED_AT]->(h:Hospital) RETURN h.city AS city", {"p": pid})
    if not r:
        return None
    p = personas.by_pair(pid)
    if p:
        return subject(p["id"])
    return {"key": pid.lower(), "pair_id": pid, "name": f"the family in {r[0]['city']} ({pid})", "first": f"the {r[0]['city']} family",
            "persona": None}


def allowed_ids(s: dict) -> set[str]:
    """The patient's own id and the families in their current swap."""
    c = health.case(s["pair_id"])
    return {s["pair_id"], *(c["pairs"] if c else [])}


def off_topic(s: dict, question: str) -> str | None:
    """A polite redirect if the question names a family outside this patient's own swap."""
    other = sorted({m.upper() for m in _ID.findall(question)} - allowed_ids(s))
    if not other:
        return None
    return (f"I can only talk about {s['name']} here. {', '.join(other)} isn't part of {s['first']}'s case. "
            f"Open that family's page to ask about them, or use Ask KindRed for questions across the whole pool.")


def frame(s: dict, question: str) -> str:
    """The question as the model sees it: about this one patient only."""
    tool = "patient_memory" if s["persona"] else "family_facts and find_loops_for"
    return (f"This conversation is only about {s['name']} ({s['pair_id']}). Answer only about them and their own swap. "
            f"If the question is about anything else, say you can only talk about {s['first']} here. "
            f"Use {tool} for what the graph knows.\n\n{question}")


def starters(s: dict) -> list[tuple[str, str, list[str], list[dict]]]:
    """Three questions answered from graph data, for a new chat, each with what it read from memory (and when that
    was learned)."""
    g = explore.family(s["pair_id"], 3)
    if not g:
        return []
    donor = next((n for n in g["nodes"] if n["id"] == f"don:{s['pair_id']}"), None)
    rel = (donor or {}).get("data", {}).get("relation") or "relative"
    why = g["why_not_own"]["text"].rstrip(".")
    out = [(f"Why can't the {rel} give to {s['first']}?",
            f"Because {why[0].lower() + why[1:]}. That's why the family joined the shared pool: another family's donor "
            f"can give to {s['first']} instead, while the {rel} gives to that family's patient.", ["family_explore"], [])]
    k = g["counts"]
    best = g["loops"][0] if g["loops"] else None
    swap = (f" The strongest swap the graph sees is a {best['size']}-way one ({' → '.join(best['pairs'] + best['pairs'][:1])}), "
            f"with a {round(best['p_all'] * 100)}% chance every donation works." if best else " No swap closes back to them yet.")
    out.append((f"Who could {s['first']} swap with?",
                f"The {rel}'s organ fits {k['gives_to']} other patients, and {k['receives_from']} other donors fit "
                f"{s['first']}. Among them, {k['two_way']} two-way and {k['three_way']} three-way swaps close back to this family.{swap}",
                ["family_explore"], []))
    if s["persona"]:
        facts = db.run("Q42_current_facts", {"persona_id": s["persona"]}, graph=personas.memory_graph(s["persona"]))
        kept = [f for f in facts if f["key"] in ("stage", "trend", "projection", "swap")]
        known = "; ".join(f["text"] for f in kept)
        out.append((f"What do the agents remember about {s['first']}?",
                    f"From {s['first']}'s memory graph: {known or 'nothing yet'}. Press Next week on the page to see it change.",
                    ["patient_memory"], [{"what": f["text"], "at": f["at"], "by": "Health watch (belief)"} for f in kept if f.get("at")]))
    else:
        c = health.case(s["pair_id"])
        out.append((f"Is {s['first']} in a swap yet?",
                    f"Yes: {c['loop_id']} ({c['route']}), now {c['status']}." if c
                    else "Not yet. They stay in the pool and are first in line for the next weekly match.",
                    ["family_facts"], []))
    return out


def history(s: dict) -> list[dict]:
    """The chat, started with the graph-answered questions the first time anyone opens it."""
    msgs = personas.conversation(s["key"])
    if msgs:
        return msgs
    from swapnet.agents import core
    with core.LOCK:  # two visitors opening a new chat at once must not both start it
        if personas.conversation(s["key"]):
            return personas.conversation(s["key"])
        now = int(time.time() * 1000)
        for i, (q, a, tools, memory) in enumerate(starters(s)):
            personas.add_message(s["key"], "user", q, at=now - (6 - 2 * i) * 60_000)
            personas.add_message(s["key"], "assistant", a, tools, "graph (starter answer, no model)",
                                 at=now - (5 - 2 * i) * 60_000, memory=memory)
    return personas.conversation(s["key"])

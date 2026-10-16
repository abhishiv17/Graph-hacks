"""The reasoning layer over the graph: plain explanations and step-by-step walkthroughs, built only from graph data.

- `why_not(donor_pair, patient_pair)`: why one family's donor can't give to another family's patient (blood group,
  antibodies against the donor's tissue type, a test that already failed, the liver size rule), read with Q58.
- `annotate(explore)`: adds a plain `why` to every family the explorer shows and to every link.
- `family_walkthrough(pair)` and `swap_walkthrough(loop)`: short spoken steps, each naming what to highlight on the
  graph. Nothing here is written by a language model; Sarvam only translates and speaks the finished sentences.
"""
import re

from swapnet import config, explore, personas
from swapnet.graph import db

_ID = re.compile(r"\b[PSL]-\d{4}\b")


def plain_reason(r: str) -> str:
    """A stored link reason as a short sentence (the same wording as the web app's plain.ts)."""
    m = re.match(r"^(\w+) → (\w+) · same blood group", r)
    if m:
        return f"same blood group ({m.group(1)})"
    if re.match(r"^\w+ → \w+ · O can give", r):
        return "blood group O can give to anyone"
    if r.startswith("virtual test clear"):
        return "no antibody against this donor on file"
    if r.startswith("DQ typed"):
        return "tissue type fully checked"
    if "DQ not typed" in r:
        return "part of the tissue type wasn't checked yet, so the lab test matters more"
    if r.startswith("offer accepted"):
        return "both hospitals said yes"
    m = re.match(r"^(left|right) lobe, (\d+) ml, for a ([\d.]+) kg patient", r)
    if m:
        return f"the {m.group(1)} part of the liver ({m.group(2)} ml) is big enough for a {m.group(3)} kg patient"
    m = re.match(r"^donor keeps (\d+)% of their liver", r)
    if m:
        return f"the donor keeps {m.group(1)}% of their liver"
    if "measured on CT" in r:
        return "liver size measured on a CT scan"
    if "estimated from height and weight" in r:
        return "liver size is estimated until the CT scan"
    return r


def why_not(donor_pair: str, patient_pair: str) -> str:
    """Why this donor can't give to that patient, in one plain clause. Empty if the graph has a live link."""
    rows = db.run("Q58_why_no_link", {"donor_pair": donor_pair, "patient_pair": patient_pair,
                                      "mfi": config.params()["mfi_threshold"]})
    if not rows:
        return "one of these families isn't in the graph"
    r = rows[0]
    if r["linked"] and r["link_status"] == "live":
        return ""
    if r["failed_cause"]:
        return f"a test between them already failed ({r['failed_detail'] or r['failed_cause']}), and the graph remembers it"
    if r["donor_organ"] != r["patient_organ"]:
        return "they are in different programs (kidney and liver never mix)"
    if not r["abo_ok"]:
        return f"blood group {r['donor_abo']} can't give to blood group {r['patient_abo']}"
    if r["clash"]:
        return f"the patient has antibodies against the donor's {', '.join(r['clash'][:3])}, so the body would reject it"
    if r["liver"] and r["patient_weight_kg"]:
        lv, w = r["liver"], float(r["patient_weight_kg"])
        rules = config.liver_params()["rules"]
        lobes = [lv.get("left_lobe_ml") or 0] + ([lv.get("right_lobe_ml") or 0] if lv.get("right_lobe_ok") else [])
        best = max(lobes)
        if best / (w * 1000) * 100 < rules["grwr_min"]:
            return f"the donor's liver piece ({best:.0f} ml) is too small for a {w:.0f} kg patient"
        return "the donor would keep too little of their own liver"
    return "the graph has no donation between them"


def _place(pair_id: str) -> str:
    r = db.raw("MATCH (:Pair {pair_id: $p})-[:REGISTERED_AT]->(h:Hospital) RETURN h.city AS c", {"p": pair_id})
    return r[0]["c"] if r else ""


def _name(pair_id: str) -> str:
    p = personas.by_pair(pair_id)
    return f"{p['name']}'s family" if p else f"the family in {_place(pair_id)} ({pair_id})"


def annotate(g: dict) -> dict:
    """Plain `why` for every family the explorer shows (how it relates to the centre family) and every link."""
    c = g["center"]
    cnode = f"fam:{c}"
    out = {e["to"] for e in g["edges"] if e["type"] == "CAN_GIVE_TO" and e["from"] == cnode}
    inn = {e["from"] for e in g["edges"] if e["type"] == "CAN_GIVE_TO" and e["to"] == cnode}
    in_loop = {p for l in g["loops"] for p in l["pairs"]}
    for n in g["nodes"]:
        if n["type"] != "family" or n["id"] == cnode:
            continue
        pid = n["label"]
        if n["id"] in out and n["id"] in inn:
            n["why"] = "A 2-way swap is possible: each family's donor fits the other's patient."
        elif n["id"] in out:
            n["why"] = f"This family's donor fits their patient, but their donor can't give back: {why_not(pid, c)}."
        elif n["id"] in inn:
            n["why"] = f"Their donor fits this family's patient, but this family's donor can't give to theirs: {why_not(c, pid)}."
        elif pid in in_loop:
            n["why"] = "One family further out: it closes a 3-way swap back to this family."
        else:
            n["why"] = "One step further out, reached through a family this donor can give to."
    for e in g["edges"]:
        if e["type"] == "CAN_GIVE_TO":
            e["why"] = "; ".join(plain_reason(x) for x in (e.get("reasons") or [])) or "a possible donation"
    return g


# ---------------------------------------------------------------- walkthroughs

def _step(text: str, nodes=(), edges=(), hops: int | None = None) -> dict:
    return {"text": text, "nodes": list(nodes), "edges": list(edges), "hops": hops}


def _ends(edge_id: str) -> tuple[str, str]:
    """The two node ids of an explorer edge id such as "don:P-0901>abo:A:HAS_ABO"."""
    a, rest = edge_id.split(">", 1)
    return a, rest.rsplit(":", 1)[0]


def family_walkthrough(pair_id: str) -> list[dict] | None:
    g = explore.family(pair_id, 3)
    if not g:
        return None
    annotate(g)
    nodes = {n["id"]: n for n in g["nodes"]}
    c, cn = pair_id, f"fam:{pair_id}"
    centre = nodes[cn]
    pat, don = nodes.get(f"pat:{c}"), nodes.get(f"don:{c}")
    persona = personas.by_pair(c)
    city = centre["data"].get("city", "")
    who = f"{persona['name']}'s family in {city}" if persona else f"a family in {city} ({c})"
    steps = [_step(f"This is {who}. The patient needs a {g['organ']}, and the patient's "
                   f"{don['data'].get('relation', 'relative') if don else 'relative'} wants to donate.",
                   [cn, f"pat:{c}", f"don:{c}"], [], 1)]
    own = g["why_not_own"]["text"].rstrip(".")
    steps.append(_step(f"But the donor can't give to their own patient: {own[0].lower() + own[1:]}.",
                       [f"pat:{c}", f"don:{c}"] + [x for e in g["why_not_own"]["edges"] for x in _ends(e)],
                       g["why_not_own"]["edges"], 1))
    k = g["counts"]
    hop1 = [n for n in g["nodes"] if n["type"] == "family" and n["hop"] == 1]
    steps.append(_step(f"So the graph looks at the whole pool. This donor fits {k['gives_to']} other patients, and "
                       f"{k['receives_from']} other donors fit this patient. The closest ones are on the ring.",
                       [cn] + [n["id"] for n in hop1], [], 1))
    # A few families that were tried but can't swap directly, with the reason from the graph.
    tried = [n for n in hop1 if n.get("why") and "can't" in n["why"]][:3]
    for n in tried:
        e = [x["id"] for x in g["edges"] if x["type"] == "CAN_GIVE_TO" and {x["from"], x["to"]} == {cn, n["id"]}]
        steps.append(_step(f"Take the family in {n['data'].get('city', '')} ({n['label']}). {n['why']}", [cn, n["id"]], e, 1))
    two = [l for l in g["loops"] if l["size"] == 2]
    three = [l for l in g["loops"] if l["size"] == 3]

    def loop_edges(l):
        ps = l["pairs"]
        return [f"fam:{ps[i]}>fam:{ps[(i + 1) % len(ps)]}:CAN_GIVE_TO" for i in range(len(ps))]

    def busy(l):  # families in the loop that are already promised to another swap
        return [nodes[f"fam:{p}"]["data"].get("city", p) for p in l["pairs"]
                if p != c and nodes.get(f"fam:{p}", {}).get("data", {}).get("status") not in (None, "waiting")]

    def taken(l):
        b = busy(l)
        return f" But {' and '.join(b)} {'is' if len(b) == 1 else 'are'} already in another swap, so it can't be used now." if b else ""

    if two:
        l = two[0]
        other = l["pairs"][1]
        e = next((x for x in g["edges"] if x["id"] == f"fam:{c}>fam:{other}:CAN_GIVE_TO"), None)
        why = "; ".join((e or {}).get("why", "both donors fit").split("; ")[:2])
        steps.append(_step(f"Out and straight back is a 2-way swap. The best one is with the family in {_place(other)} ({other}): "
                           f"{why}. Both donations together have a {round(l['p_all'] * 100)}% chance of working.{taken(l)}",
                           [f"fam:{p}" for p in l["pairs"]], loop_edges(l), 2))
    else:
        steps.append(_step("No family can give straight back, so there is no 2-way swap. A shallow search stops here.", [cn], [], 2))
    if three:
        l = three[0]
        cities = " → ".join(_place(p) for p in l["pairs"] + l["pairs"][:1])
        steps.append(_step(f"Looking one family further finds a 3-way swap: {cities}. Each donor gives to the next family's "
                           f"patient, so all three get an organ. {round(l['p_all'] * 100)}% chance every donation works.{taken(l)}",
                           [f"fam:{p}" for p in l["pairs"]], loop_edges(l), 3))
    elif not two:
        steps.append(_step("Looking one family further finds no 3-way swap yet either. The agents keep watching, and search again "
                           "the moment a new family joins.", [cn], [], 3))
    status = centre["data"].get("status")
    loop_id = next((r["lid"] for r in db.raw("MATCH (:Pair {pair_id: $p})-[:IN_LOOP]->(l:Loop) WHERE l.status <> 'broken' "
                                            "AND NOT l.loop_id ENDS WITH '-FB' RETURN l.loop_id AS lid, l.created_at AS at ORDER BY at DESC LIMIT 1",
                                            {"p": c})), None)
    if loop_id:
        where = {"selected": "just chosen", "offered": "waiting for the hospitals", "testing": "having its tests",
                 "committee": "with the legal committee", "locked": "booked for surgery", "transplanted": "done: the transplant happened"}
        steps.append(_step(f"The agents chose a swap for this family ({loop_id}), and it is {where.get(status, status)}. "
                           "Open the swap to follow it.", [cn], [], None))
    else:
        steps.append(_step("No swap has been chosen for this family yet. It stays first in line for the next weekly match.", [cn], [], None))
    return steps


def swap_walkthrough(detail: dict) -> list[dict]:
    """Steps for one swap, from its loop detail (links with stored reasons, families, tests, committee)."""
    links, fams = detail["links"], detail["families"]
    cities = [f["city"] for f in fams]
    organ = (detail["loop"].get("organ") or "kidney")
    gift = "part of their liver" if organ == "liver" else "a kidney"
    steps = [_step(f"This swap joins {len(fams)} families: {', '.join(cities[:-1])} and {cities[-1]}. No donor can give to their own "
                   f"patient, so each donor gives {gift} to the next family's patient instead. Every patient gets one.",
                   [f["pair_id"] for f in fams], [])]
    wf = {(w["from_pair"], w["to_pair"]): w for w in detail["workflow"]}
    for i, l in enumerate(links):
        key = f"{l['from_pair']}>{l['to_pair']}"
        why = "; ".join(plain_reason(r) for r in (l.get("reasons") or [])[:3])
        w = wf.get((l["from_pair"], l["to_pair"]), {})
        test = {"negative": "Its test passed.", "positive": "Its test failed.", "pending": "Its test is still to come.",
                "cancelled": "Its test wasn't needed."}.get(w.get("result") or "", "")
        steps.append(_step(f"Donation {i + 1}: {l['from_city']}'s donor, the patient's {l.get('donor_relation') or 'relative'}, "
                           f"gives to {l['to_city']}'s patient. Why it works: {why or 'the graph has a live link'}. "
                           f"{round((l.get('p_success') or 0) * 100)}% chance it works. {test}".strip(),
                           [l["from_pair"], l["to_pair"]], [key]))
    failed = next((l for l in links if l.get("status") == "failed"), None)
    if failed:
        steps.append(_step(f"The test from {failed['from_city']} to {failed['to_city']} failed: {failed.get('failed_detail') or 'positive'}. "
                           "KindRed remembers it, so it never suggests that donation again, and searches nearby for a family to replace it.",
                           [failed["from_pair"], failed["to_pair"]], [f"{failed['from_pair']}>{failed['to_pair']}"]))
    if detail.get("fallback"):
        steps.append(_step("If one family has to drop out, a smaller 2-way swap inside this one is kept ready as a backup.", [], []))
    com = detail.get("committee") or {}
    blocking = next((p for p in com.get("pairs", []) if p["pair_id"] == com.get("blocking")), None)
    if blocking:
        steps.append(_step(f"In India the legal committee approves every family. {blocking['city']} still has to send: "
                           f"{', '.join(m.replace('_', ' ') for m in blocking['missing'])}. One missing paper holds up the whole swap.",
                           [blocking["pair_id"]], []))
    loop = detail["loop"]
    steps.append(_step(f"All together there is a {round((loop.get('p_success') or 0) * 100)}% chance every donation works, and about "
                       f"{round(loop.get('expected_tx') or 0, 1)} of {len(fams)} transplants are expected.",
                       [f["pair_id"] for f in fams], [f"{l['from_pair']}>{l['to_pair']}" for l in links]))
    return steps


def spoken(text: str) -> str:
    """What a voice should read: the sentence without ids in brackets (they're on screen)."""
    t = re.sub(r"\s*\((?:[PSL]-\d{4}(?:, )?)+\)", "", text)
    return _ID.sub(lambda m: m.group(0).replace("-", " "), t)

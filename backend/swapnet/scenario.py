"""Demo scenario s0031: a background pool across 11 cities plus four scripted families.

Hyderabad P-0154, Bengaluru P-0211 and Kolkata P-0388 cannot match inside their own
hospitals. Hyderabad and Bengaluru clash by blood group (most Indian swap pairs do) and are
barely sensitised (cPRA about 12 and 14). Kolkata clashes by tissue type and is highly
sensitised (cPRA 91), so it has almost no other partner: the kind of patient 3-way loops
help most, and the riskiest link in the loop. Bengaluru's donor has DQ7, but DQ was never typed, so the virtual test is clear
and the lab test against Kolkata's DQ7 antibody comes back positive. Chennai P-0377 joins
the pool after the plan is made. Every person is synthetic.
"""
import yaml

from swapnet import config, organs
from swapnet.agents import core
from swapnet.gen.generator import Generator, Pair
from swapnet.gen.liver import private_notes
from swapnet.graph import db

DOCS = ["hla_report", "blood_group_card", "relationship_proof", "id_proof", "consent"]


def _ag(names: list[str]) -> list[dict]:
    def locus(n: str) -> str:
        for l in ("DR", "DQ", "A", "B"):
            if n.startswith(l):
                return l
        return "?"
    return [{"name": n, "locus": locus(n)} for n in names]


def _ab(spec: dict[str, int]) -> list[dict]:
    return [{"name": n, "locus": a["locus"], "mfi": m} for (n, m), a in zip(spec.items(), _ag(list(spec)))]


def _docs(missing: list[str] = ()) -> dict:
    return {d: ("missing" if d in missing else "verified") for d in DOCS}


def scripted() -> dict[str, Pair]:
    pairs = _scripted()
    g = Generator(0)
    for pr in pairs.values():
        pr.patient["cpra"] = g.cpra(pr.antibodies)
    return pairs


def _scripted() -> dict[str, Pair]:
    return {
        "P-0154": Pair("P-0154", "HYD",
                       {"abo": "A", "sex": "F", "relation": "wife", "age_band": "35-44", "bmi": 24.1, "untyped_loci": []},
                       {"abo": "B", "sex": "M", "cpra": 0, "age_band": "45-59"},
                       _ag(["A2", "A11", "B35", "B51", "DR15", "DR7", "DQ6", "DQ5"]),
                       _ab({"DR14": 3300}),
                       _docs(), 22, "ph-hyd-0154"),
        "P-0211": Pair("P-0211", "BLR",
                       {"abo": "B", "sex": "M", "relation": "brother", "age_band": "35-44", "bmi": 26.0, "untyped_loci": ["DQ"]},
                       {"abo": "A", "sex": "F", "cpra": 0, "age_band": "30-44"},
                       _ag(["A24", "A33", "B40", "B52", "DR13", "DR3", "DQ7", "DQ2"]),
                       _ab({"B44": 3800}),
                       _docs(["relationship_proof"]), 30, "ph-blr-0211"),
        "P-0388": Pair("P-0388", "KOL",
                       {"abo": "O", "sex": "F", "relation": "mother", "age_band": "45-54", "bmi": 23.5, "untyped_loci": []},
                       {"abo": "B", "sex": "M", "cpra": 93, "age_band": "18-29"},
                       _ag(["A1", "A3", "B8", "B57", "DR4", "DR11", "DQ8", "DQ6"]),
                       _ab({"A1": 9800, "B8": 11200, "DQ7": 9000, "A68": 6100, "B44": 5400, "DR1": 4800,
                            "DR14": 4200, "A26": 3900, "B15": 3500, "DR10": 3100, "DQ8": 8800}),
                       _docs(), 18, "ph-kol-0388"),
        "P-0377": Pair("P-0377", "CHE",
                       {"abo": "O", "sex": "M", "relation": "husband", "age_band": "45-54", "bmi": 27.2, "untyped_loci": []},
                       {"abo": "B", "sex": "F", "cpra": 31, "age_band": "30-44"},
                       _ag(["A2", "A26", "B7", "B15", "DR1", "DR10", "DQ5", "DQ6"]),
                       _ab({"B7": 7600, "DR10": 3300}),
                       _docs(["relationship_proof", "id_proof", "consent"]), 2, "ph-che-0377"),
    }


def _liver(total: int, left: int, right_ok: bool = True) -> dict:
    return {"liver_volume_ml": total, "left_lobe_ml": left, "right_lobe_ml": total - left, "right_lobe_ok": right_ok, "steatosis": False}


LIVER_DOCS = ["ct_volumetry_report", "blood_group_card", "relationship_proof", "id_proof", "consent"]


def scripted_liver() -> dict[str, Pair]:
    """Liver story L-loop: Delhi P-0412 -> Chennai P-0433 -> Kochi P-0451 -> Delhi.

    All three patients are heavy (95-105 kg), so few donors in the pool have a lobe big enough for them:
    the liver version of a highly sensitised kidney patient. Delhi and Chennai clash by blood group (A/B
    both ways, the commonest reason for Indian liver swaps). Kochi's blood groups fit, but his daughter's
    right lobe is too small for him (GRWR 0.76%): a clash only liver has. Chennai's donor has no CT
    volumetry yet, so the pool sees a formula estimate (right lobe 878 ml, just enough for Kochi: 0.84%).
    The work-up measures 780 ml (0.74%) and the link fails. Delhi <-> Chennai stays possible as a 2-way
    fallback. Every person is synthetic."""
    def pr(pid, hosp, donor, patient, seen, ct, missing=(), age=10, surgical="ELIGIBLE"):
        docs = {d: ("missing" if d in missing else "verified") for d in LIVER_DOCS}
        d_ev = {"anatomy_review": "ELIGIBLE", "donor_evaluation": "ELIGIBLE"}
        p_ev = {"recipient_evaluation": "ELIGIBLE", "surgical_review": surgical}
        return Pair(pid, hosp, {**donor, "untyped_loci": []}, {**patient, "cpra": 0, **p_ev}, [], [], docs, age, f"ph-{hosp.lower()}-{pid[-4:]}",
                    organ="liver", liver={**seen, **d_ev}, liver_ct=ct, private=private_notes(d_ev))
    delhi_l = _liver(1300, 455)
    chennai_seen, chennai_ct = {**_liver(1350, 472), "volumetry": "estimate"}, _liver(1180, 400)
    kochi_l = _liver(1230, 430)
    return {
        "P-0412": pr("P-0412", "DEL",
                     {"abo": "A", "sex": "M", "relation": "son", "age_band": "25-34", "bmi": 26.3, "height_cm": 178, "weight_kg": 83},
                     {"abo": "B", "sex": "M", "age_band": "45-59", "height_cm": 174, "weight_kg": 95.0, "meld": 18},
                     {**delhi_l, "volumetry": "ct"}, delhi_l, age=16),
        "P-0433": pr("P-0433", "CHE",
                     {"abo": "B", "sex": "M", "relation": "brother", "age_band": "35-44", "bmi": 26.4, "height_cm": 172, "weight_kg": 78},
                     {"abo": "A", "sex": "M", "age_band": "45-59", "height_cm": 176, "weight_kg": 98.0, "meld": 22},
                     chennai_seen, chennai_ct, missing=("ct_volumetry_report",), age=6, surgical="REVIEW_REQUIRED"),
        "P-0451": pr("P-0451", "COK",
                     {"abo": "O", "sex": "F", "relation": "daughter", "age_band": "25-34", "bmi": 25.0, "height_cm": 166, "weight_kg": 69},
                     {"abo": "B", "sex": "M", "age_band": "45-59", "height_cm": 178, "weight_kg": 105.0, "meld": 27},
                     {**kochi_l, "volumetry": "ct"}, kochi_l, age=12),
    }


# Families each organ's demo story adds once its background pool is loaded (kidney's are timed separately below).
STORY_FAMILIES = {"liver": scripted_liver}


def settings() -> dict:
    p = config.DATA / "scenarios" / "s0031.yaml"
    return yaml.safe_load(p.read_text(encoding="utf-8")) if p.exists() else {"seed": 7, "background_pairs": 150}


def _load_pool(org: organs.Organ, n: int, seed: int) -> list:
    from swapnet.graph import publish
    codes = org.hospitals()
    pool = org.background(n, codes, seed)
    for pr in pool:
        publish.write_private(pr)
        publish.publish(pr, build_edges=False)
    for pr in pool:
        publish.build(pr.pair_id, org.name)
    db.event("Exchange", f"Synthetic {org.name} pool loaded: {n} pairs across {len(codes)} hospitals. "
                         "Synthetic demo data, no real patients.", "info")
    return pool


def load(seed: int | None = None, background: int | None = None, plan: bool = True) -> dict:
    s = settings()
    seed = s["seed"] if seed is None else seed
    background = s["background_pairs"] if background is None else background
    from swapnet import personas
    for pid in personas.ids():  # conversations survive a restart: move any still in a memory graph first
        if personas.memory_graph(pid) in db.db().list_graphs():
            personas._move_messages(pid)
    db.reset_all()
    db.reset_seq()
    db.setup_schema()
    core.ensure_agents()
    _load_pool(organs.get("kidney"), background, seed)
    sc = scripted()
    out = {"seed": seed, "pairs": background + 3}
    if plan:
        # Earlier weeks: plan #41 is already out for offers and lab tests.
        out["earlier_plan"] = core.MatchingAgent().run_plan()
        for loop in out["earlier_plan"]["loops"]:
            _settle_earlier(loop["loop_id"])
    for code in ("P-0154", "P-0211", "P-0388"):
        core.IntakeAgent(sc[code].hospital).add_pair(sc[code])
    # Other organs' pools join after the kidney story is in place, so it plays out exactly as before.
    for name, o in (s.get("organs") or {}).items():
        _load_pool(organs.get(name), o["background_pairs"], o["seed"])
        story = STORY_FAMILIES.get(name, dict)()
        for pr in story.values():
            core.IntakeAgent(pr.hospital).add_pair(pr)
        out["pairs"] += o["background_pairs"] + len(story)
    if plan:
        out["plan"] = core.MatchingAgent().run_plan(first="P-0154")
    # Demo patients join after this week's plan, so both programs' stories play out as before (docs/personas.md).
    from swapnet import personas
    from swapnet.agents import health
    health.ensure_agents()
    out["personas"] = personas.seed_all()
    out["pairs"] += len(out["personas"])
    return out


def _settle_earlier(loop_id: str) -> None:
    """Earlier loops already had their lab tests: mark them done so this week's story is about S-0031."""
    db.raw("MATCH (x:Crossmatch)-[:IN]->(l:Loop {loop_id: $l}) SET x.result = 'negative', x.at = timestamp() "
           "WITH DISTINCT l SET l.status = 'committee'", {"l": loop_id})
    db.raw("MATCH (p:Pair)-[:IN_LOOP]->(:Loop {loop_id: $l}) SET p.status = 'locked'", {"l": loop_id})


def add_chennai() -> dict:
    return core.IntakeAgent("CHE").add_pair(scripted()["P-0377"])


def find_seed(tries: int = 30, background: int = 150) -> int | None:
    """Pick a background seed where the plan contains the scripted loop and the repair uses Chennai."""
    for seed in range(1, tries + 1):
        r = load(seed, background)
        loops = r["plan"]["loops"]
        main = next((l for l in loops if set(l["pairs"]) == {"P-0154", "P-0211", "P-0388"}), None)
        if not main:
            print(seed, "scripted loop not chosen")
            continue
        add_chennai()
        out = core.CrossmatchCoordinator().run_lab(main["loop_id"])
        pos = [x for x in out if x["result"] == "positive"]
        if not pos:
            print(seed, "no positive")
            continue
        t = db.raw("MATCH (t:Task) RETURN t.payload AS p")
        import json
        prop = json.loads(t[0]["p"])
        rec = prop["recommended"]
        print(seed, "repair", rec and rec["pairs"])
        if rec and "P-0377" in rec["pairs"] and {"P-0154", "P-0211"} <= set(rec["pairs"]):
            return seed
    return None

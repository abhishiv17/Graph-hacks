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

from swapnet import config
from swapnet.agents import core
from swapnet.gen.generator import Generator, Pair
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


def settings() -> dict:
    p = config.DATA / "scenarios" / "s0031.yaml"
    return yaml.safe_load(p.read_text(encoding="utf-8")) if p.exists() else {"seed": 7, "background_pairs": 150}


def load(seed: int | None = None, background: int | None = None, plan: bool = True) -> dict:
    s = settings()
    seed = s["seed"] if seed is None else seed
    background = s["background_pairs"] if background is None else background
    db.reset_all()
    db.reset_seq()
    db.setup_schema()
    core.ensure_agents()
    codes = [h["code"] for h in config.hospitals()["hospitals"]]
    pool = Generator(seed).pairs(background, codes, start=1000)
    sc = scripted()
    from swapnet.graph import publish
    for pr in pool:
        publish.write_private(pr)
        publish.publish(pr, build_edges=False)
    for pr in pool:
        publish.build(pr.pair_id)
    db.event("Exchange", f"Synthetic pool loaded: {background} pairs across {len(codes)} hospitals. "
                         "Synthetic demo data, no real patients.", "info")
    out = {"seed": seed, "pairs": background + 3}
    if plan:
        # Earlier weeks: plan #41 is already out for offers and lab tests.
        out["earlier_plan"] = core.MatchingAgent().run_plan()
        for loop in out["earlier_plan"]["loops"]:
            _settle_earlier(loop["loop_id"])
    for code in ("P-0154", "P-0211", "P-0388"):
        core.IntakeAgent(sc[code].hospital).add_pair(sc[code])
    if plan:
        out["plan"] = core.MatchingAgent().run_plan(first="P-0154")
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

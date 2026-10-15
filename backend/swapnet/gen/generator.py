"""Synthetic incompatible donor-patient pairs, India-first (Saidman-style rejection sampling).

Draw a patient and their related donor; keep the pair only if they cannot donate to each
other (blood groups clash, or the patient has antibodies against the donor's tissue type).
All people are synthetic. Parameters: data/params/india_kidney.yaml.
"""
import random
from dataclasses import dataclass, field

from swapnet import config

ABO_OK = {"O": {"O", "A", "B", "AB"}, "A": {"A", "AB"}, "B": {"B", "AB"}, "AB": {"AB"}}
LOCI = ["A", "B", "DR", "DQ"]


def abo_ok(donor: str, patient: str) -> bool:
    return patient in ABO_OK[donor]


@dataclass
class Pair:
    pair_id: str
    hospital: str
    donor: dict
    patient: dict
    antigens: list[dict]
    antibodies: list[dict]
    documents: dict = field(default_factory=dict)
    approval_age_days: int = 0
    phone_hash: str = ""

    def clashes(self, antigens: list[dict] | None = None) -> set[str]:
        names = {a["name"] for a in (antigens or self.antigens)}
        return {ab["name"] for ab in self.antibodies if ab["name"] in names}


class Generator:
    def __init__(self, seed: int = 7):
        self.rng = random.Random(seed)
        self.p = config.params()
        self._ref_donors = [self._typing() for _ in range(1500)]

    def _pick(self, dist: dict) -> str:
        r, acc = self.rng.random(), 0.0
        for k, v in dist.items():
            acc += v
            if r <= acc:
                return k
        return list(dist)[-1]

    def _typing(self) -> list[dict]:
        out = []
        for locus in LOCI:
            for _ in range(2):
                out.append({"name": self._pick(self.p["hla"][locus]), "locus": locus})
        return [dict(t) for t in {(a["name"], a["locus"]): a for a in out}.values()]

    def cpra(self, antibodies: list[dict]) -> int:
        names = {a["name"] for a in antibodies}
        if not names:
            return 0
        hit = sum(1 for d in self._ref_donors if any(a["name"] in names for a in d))
        return round(100 * hit / len(self._ref_donors))

    def _antibodies(self, band: str) -> tuple[list[dict], int]:
        lo, hi = self.p["pra_bands"][band]["cpra"]
        if band == "low" and self.rng.random() < 0.7:
            return [], 0
        pool = [(n, locus) for locus in LOCI for n in self.p["hla"][locus]]
        best = ([], 0)
        for _ in range(60):
            k = self.rng.randint(1, 10)
            abs_ = [{"name": n, "locus": l, "mfi": self.rng.randint(2500, 14000)} for n, l in self.rng.sample(pool, k)]
            c = self.cpra(abs_)
            if lo <= c <= hi:
                return abs_, c
            if abs(c - (lo + hi) / 2) < abs(best[1] - (lo + hi) / 2):
                best = (abs_, c)
        return best

    def person_pair(self) -> tuple[dict, dict, list[dict], list[dict]]:
        p = self.p
        pat_male = self.rng.random() < p["recipient_male_share"]
        don_female = self.rng.random() < p["donor_female_share"]
        rel = self._pick(p["relations"]["female" if don_female else "male"])
        if rel == "wife" and not pat_male:
            rel = "mother"
        if rel == "husband" and pat_male:
            rel = "brother"
        band = self._pick({k: v["share"] for k, v in p["pra_bands"].items()})
        antibodies, cpra = self._antibodies(band)
        untyped = ["DQ"] if self.rng.random() < p["dq_untyped_share"] else []
        donor = {"abo": self._pick(p["abo"]), "sex": "F" if don_female else "M", "relation": rel,
                 "age_band": self.rng.choice(["25-34", "35-44", "45-54", "55-64"]),
                 "bmi": round(self.rng.gauss(25, 3.5), 1), "untyped_loci": untyped}
        patient = {"abo": self._pick(p["abo"]), "sex": "M" if pat_male else "F", "cpra": cpra,
                   "age_band": self.rng.choice(["18-29", "30-44", "45-59", "60+"])}
        return donor, patient, self._typing(), antibodies

    def pairs(self, n: int, hospitals: list[str], start: int = 1000) -> list[Pair]:
        out, i = [], start
        docs = config.hospitals()["required_documents"]
        while len(out) < n:
            donor, patient, antigens, antibodies = self.person_pair()
            pr = Pair(f"P-{i:04d}", self.rng.choice(hospitals), donor, patient, antigens, antibodies)
            # Keep only incompatible pairs: that is who enters a swap pool.
            if abo_ok(donor["abo"], patient["abo"]) and not pr.clashes():
                continue
            pr.documents = {d: ("verified" if self.rng.random() < 0.8 else "missing") for d in docs}
            pr.approval_age_days = self.rng.randint(0, 40)
            pr.phone_hash = f"ph{self.rng.randint(10**6, 10**7)}"
            out.append(pr)
            i += 1
        return out

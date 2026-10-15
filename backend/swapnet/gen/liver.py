"""Synthetic living-donor liver pairs, India-first (Ergin, Sönmez and Ünver 2020 generator).

A liver donor gives one lobe. The link works when blood groups fit, the graft is big enough for the
patient (GRWR, graft weight as a % of body weight) and the donor keeps enough liver. The left lobe
is safer for the donor, so it is used when it is big enough; the right lobe only if the donor agreed.
Some donors' CT volumetry is still pending: the shared pool then sees a volume estimated from height
and weight, and only the hospital's private graph holds the measured one. Parameters:
data/params/india_liver.yaml. All people are synthetic.
"""
import math
import random

from swapnet import config
from swapnet.gen.generator import Pair, abo_ok


def liver_fit(liver: dict, patient_weight_kg: float, rules: dict | None = None) -> dict | None:
    """The lobe this donor can give this patient, or None. Mirrors Q21_liver_edges_for_pair."""
    rules = rules or config.liver_params()["rules"]
    total, left, right = liver["liver_volume_ml"], liver["left_lobe_ml"], liver["right_lobe_ml"]
    g_left = left / (patient_weight_kg * 10)
    if g_left >= rules["grwr_min"]:
        return {"lobe": "left", "grwr": g_left, "keep": 1 - left / total}
    g_right, keep = right / (patient_weight_kg * 10), left / total
    if liver.get("right_lobe_ok") and g_right >= rules["grwr_min"] and keep >= rules["remnant_min"]:
        return {"lobe": "right", "grwr": g_right, "keep": keep}
    return None


def own_clash(donor_abo: str, patient_abo: str, liver: dict | None, patient_weight_kg: float | None) -> str:
    """Why a liver family can't donate within itself, in plain words."""
    if not abo_ok(donor_abo, patient_abo):
        return "blood groups clash"
    if not liver or not patient_weight_kg:
        return "graft size"
    rules = config.liver_params()["rules"]
    right_ok = liver["right_lobe_ml"] / (patient_weight_kg * 10) >= rules["grwr_min"]
    if right_ok and liver.get("right_lobe_ok") and liver["left_lobe_ml"] / liver["liver_volume_ml"] < rules["remnant_min"]:
        return "donor would keep too little liver"
    if right_ok and not liver.get("right_lobe_ok"):
        return "left lobe too small; donor gives the left lobe only"
    return "graft too small for the patient"


def private_notes(d_ev: dict) -> dict:
    """What stays in the hospital's private graph: the clinical note behind each shared status (synthetic)."""
    a = d_ev["anatomy_review"]
    note = {"ELIGIBLE": "Synthetic note: standard vascular and biliary anatomy on imaging.",
            "REVIEW_REQUIRED": "Synthetic note: anatomical variant flagged for the surgical team to review.",
            "UNKNOWN": "Synthetic note: imaging not yet reported.",
            "INELIGIBLE": "Synthetic note: anatomy unsuitable for donation at this centre."}[a]
    return {"evaluation_note": note}


class LiverGenerator:
    def __init__(self, seed: int = 11):
        self.rng = random.Random(seed)
        # Evaluation statuses come from their own stream, so adding them leaves every volume, blood group and
        # weight (and so every link and loop) exactly as the seed produced before.
        self.eval_rng = random.Random(seed * 7919 + 1)
        self.p = config.liver_params()

    def _pick(self, dist: dict) -> str:
        r, acc = self.rng.random(), 0.0
        for k, v in dist.items():
            acc += v
            if r <= acc:
                return k
        return list(dist)[-1]

    def _norm(self, d: dict, lo: float | None = None, hi: float | None = None) -> float:
        lo = d.get("min", d["mean"] - 3 * d["sd"]) if lo is None else lo
        hi = d.get("max", d["mean"] + 3 * d["sd"]) if hi is None else hi
        while True:
            x = self.rng.gauss(d["mean"], d["sd"])
            if lo <= x <= hi:
                return x

    def _body(self, male: bool, bmi: dict) -> tuple[float, float, float]:
        h = self._norm(self.p["height_cm"]["male" if male else "female"])
        b = self._norm(bmi, lo=17.0)
        return round(h), round(b * (h / 100) ** 2, 1), round(b, 1)

    def _volume(self, h: float, w: float) -> float:
        bsa = math.sqrt(h * w / 3600)                       # Mosteller
        v = self.p["liver_volume"]
        return v["a"] * bsa + v["b"]

    def liver(self, h: float, w: float) -> tuple[dict, dict]:
        """(what the shared pool sees, what CT volumetry measures). The two match once CT is done."""
        est = self._volume(h, w)
        true = est * max(0.6, self.rng.gauss(1.0, self.p["true_volume_sd"]))
        share = self._norm(self.p["left_lobe_share"])
        ct = {"liver_volume_ml": round(true), "left_lobe_ml": round(true * share), "right_lobe_ml": round(true * (1 - share))}
        right_ok = self.rng.random() < self.p["right_lobe_willing"]
        if self.rng.random() < self.p["volumetry_pending_share"]:
            nominal = self.p["left_lobe_share"]["mean"]
            seen = {"liver_volume_ml": round(est), "left_lobe_ml": round(est * nominal), "right_lobe_ml": round(est * (1 - nominal)),
                    "volumetry": "estimate"}
        else:
            seen = {**ct, "volumetry": "ct"}
        return {**seen, "right_lobe_ok": right_ok, "steatosis": False}, ct

    def evaluation(self) -> tuple[dict, dict]:
        """Synthetic evaluation statuses (ELIGIBLE, REVIEW_REQUIRED, UNKNOWN, INELIGIBLE): (donor's, patient's)."""
        ev = self.p["evaluation"]
        def pick(dist: dict) -> str:
            r, acc = self.eval_rng.random(), 0.0
            for k, v in dist.items():
                acc += v
                if r <= acc:
                    return k
            return list(dist)[-1]
        return ({"anatomy_review": pick(ev["anatomy_review"]), "donor_evaluation": pick(ev["donor_evaluation"])},
                {"recipient_evaluation": pick(ev["recipient_evaluation"]), "surgical_review": pick(ev["surgical_review"])})

    def person_pair(self) -> tuple[dict, dict, dict, dict]:
        p = self.p
        pat_male = self.rng.random() < p["recipient_male_share"]
        don_female = self.rng.random() < p["donor_female_share"]
        rel = self._pick(p["relations"]["female" if don_female else "male"])
        if rel == "wife" and not pat_male:
            rel = "daughter"
        if rel == "husband" and pat_male:
            rel = "son"
        dh, dw, dbmi = self._body(not don_female, p["donor_bmi"])
        ph, pw, _ = self._body(pat_male, p["recipient_bmi"])
        liver, ct = self.liver(dh, dw)
        donor = {"abo": self._pick(p["abo"]), "sex": "F" if don_female else "M", "relation": rel,
                 "age_band": self.rng.choice(["18-24", "25-34", "35-44", "45-54"]),
                 "bmi": dbmi, "height_cm": dh, "weight_kg": dw, "untyped_loci": []}
        patient = {"abo": self._pick(p["abo"]), "sex": "M" if pat_male else "F", "cpra": 0,
                   "age_band": self.rng.choice(["18-29", "30-44", "45-59", "60+"]),
                   "height_cm": ph, "weight_kg": pw, "meld": round(self._norm(p["meld"]))}
        return donor, patient, liver, ct

    def pairs(self, n: int, hospitals: list[str], start: int = 5000) -> list[Pair]:
        out, i = [], start
        docs = self.p.get("required_documents") or config.hospitals()["required_documents"]
        while len(out) < n:
            donor, patient, liver, ct = self.person_pair()
            # Keep only families who can't donate within themselves: that is who enters a swap pool.
            if abo_ok(donor["abo"], patient["abo"]) and liver_fit(liver, patient["weight_kg"]):
                continue
            d_ev, p_ev = self.evaluation()
            pr = Pair(f"P-{i:04d}", self.rng.choice(hospitals), donor, {**patient, **p_ev}, [], [], organ="liver",
                      liver={**liver, **d_ev}, liver_ct=ct, private=private_notes(d_ev))
            pr.documents = {d: ("verified" if self.rng.random() < 0.8 else "missing") for d in docs}
            pr.approval_age_days = self.rng.randint(0, 40)
            pr.phone_hash = f"ph{self.rng.randint(10**6, 10**7)}"
            out.append(pr)
            i += 1
        return out

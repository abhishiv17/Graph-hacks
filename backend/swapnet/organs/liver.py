"""Living-donor liver: blood groups, then graft size (Q21). The donor gives one lobe; the link holds when
the graft is big enough for the patient (GRWR) and the donor keeps enough liver. Each link's test is the
donor work-up: CT volumetry measures the lobe, which can be smaller than the height-and-weight estimate
the pool matched on. A failed work-up teaches the pool the measured volume."""
from swapnet import config
from swapnet.gen.liver import LiverGenerator, own_clash
from swapnet.graph import db
from swapnet.organs.base import Organ


class Liver(Organ):
    name = "liver"
    prefix = "L-"
    params_file = "india_liver.yaml"
    edge_query = "Q21_liver_edges_for_pair"
    test_kind = "volumetry"
    test_name = "donor work-up (CT volumetry)"
    failure_cause = "graft_too_small"
    passed_reason = "donor work-up passed: CT volumetry confirms the graft size"
    risk_reason_markers = ("liver volume", "donor work-up")
    hold_reason = "the incoming donor's liver volume is only estimated"
    done_text = "All donor work-ups passed"
    integrity_query = "Q29_integrity_liver"
    texts = {
        "en": {
            "Lab tests": "Donor checks",
            "in_2": "Your {rel} gives part of their liver to another family's patient, and a donor from the other family gives part of theirs to you.",
            "in_3": "Your {rel} gives part of their liver to another family's patient, and a donor from a third family gives part of theirs to you.",
            "retry_b": ("One donor check in that swap showed a liver lobe was too small. That was not caused by anything you did. "
                        "You now get priority in the next weekly match."),
            "replaced": ("One donor check didn't work out, so a new family has been found. Your place in the swap is safe. "
                         "We'll message you when their checks are back."),
            "committee": "All donor checks are done and fine. The authorisation committee is reviewing the files.",
            "testing": "Donor checks are under way, including a CT scan that measures each liver. We'll message you when they are back.",
        },
        "hi": {
            "Lab tests": "दाता की जाँच",
            "in_2": "आपके {rel} अपने लिवर का एक हिस्सा दूसरे परिवार के मरीज़ को देंगे, और उस परिवार का दाता आपको देगा।",
            "in_3": "आपके {rel} अपने लिवर का एक हिस्सा दूसरे परिवार के मरीज़ को देंगे, और तीसरे परिवार का दाता आपको देगा।",
            "retry_b": ("उस स्वैप में एक दाता की जाँच में लिवर का हिस्सा छोटा निकला। इसमें आपकी कोई गलती नहीं थी। "
                        "अगले साप्ताहिक मिलान में आपको प्राथमिकता मिलेगी।"),
            "replaced": ("एक दाता की जाँच ठीक नहीं रही, इसलिए एक नया परिवार मिल गया है। स्वैप में आपकी जगह सुरक्षित है। "
                         "उनकी जाँच आने पर हम आपको संदेश भेजेंगे।"),
            "committee": "दाताओं की सभी जाँचें पूरी और ठीक हैं। प्राधिकरण समिति फ़ाइलें देख रही है।",
            "testing": "दाताओं की जाँच चल रही है, जिसमें लिवर नापने वाला CT स्कैन भी शामिल है। नतीजे आने पर हम आपको संदेश भेजेंगे।",
        },
    }

    def edge_params(self) -> dict:
        return config.liver_edge_params()

    def rules(self) -> list[dict]:
        r = self.params()["rules"]
        src = "program configuration (BMC Surgery 2019, data/params/india_liver.yaml)"
        return super().rules() + [
            {"code": "GRAFT_SIZE", "text": f"graft-to-recipient weight ratio at least {r['grwr_min']}%", "source": src},
            {"code": "DONOR_REMNANT", "text": f"donor keeps at least {r['remnant_min']:.0%} of their liver", "source": src},
            {"code": "ANATOMY_NOT_INELIGIBLE",
             "text": "anatomical review (vascular and biliary) and donor evaluation are not INELIGIBLE; REVIEW_REQUIRED and UNKNOWN are flagged",
             "source": "program status rule (no numeric threshold)"},
            {"code": "DONOR_WORKUP", "text": "every link passes the donor work-up (CT volumetry) before committee",
             "source": "program workflow"}]

    def constraints(self, link: dict) -> tuple[list[str], list[str]]:
        done, flags = super().constraints(link)
        done += ["GRAFT_SIZE", "DONOR_REMNANT", "ANATOMY_NOT_INELIGIBLE"]
        if link.get("test_passed"):
            done.append("DONOR_WORKUP")
        if link.get("vxm") == "risk":
            flags.append("VOLUME_ESTIMATED: graft size uses a height-and-weight estimate until CT volumetry")
        if link.get("anatomy_review") in ("REVIEW_REQUIRED", "UNKNOWN"):
            flags.append(f"ANATOMY_{link['anatomy_review']}: anatomical review needs a person before surgery")
        return done, flags

    def lab_pair(self, donor_pair: str, patient_pair: str) -> str:
        return donor_pair   # CT volumetry is done where the donor is

    @staticmethod
    def measured(donor_pair: str, donor_hospital: str) -> dict | None:
        """CT volumetry for a liver donor, from the hospital's private graph."""
        r = db.raw("MATCH (:Pair {pair_id: $id})-[:DONOR]->(d:Person) RETURN d.ct_liver_volume_ml AS v, "
                   "d.ct_left_lobe_ml AS l, d.ct_right_lobe_ml AS r", {"id": donor_pair}, graph=config.hospital_graph(donor_hospital))
        if not r or r[0]["v"] is None:
            return None
        return {"liver_volume_ml": r[0]["v"], "left_lobe_ml": r[0]["l"], "right_lobe_ml": r[0]["r"]}

    def run_test(self, donor_pair: str, donor_hospital: str, patient_pair: str) -> dict:
        """Re-check the planned lobe against the CT-measured volumes."""
        ct = self.measured(donor_pair, donor_hospital)
        link = db.raw("MATCH (:Pair {pair_id: $a})-[e:CAN_GIVE_TO]->(:Pair {pair_id: $b})-[:HAS_PATIENT]->(r:Patient) "
                      "RETURN e.lobe AS lobe, r.weight_kg AS w", {"a": donor_pair, "b": patient_pair})
        if not ct or not link:
            return {"result": "negative"}
        rules = self.params()["rules"]
        lobe, w = link[0]["lobe"], link[0]["w"]
        graft = ct["left_lobe_ml"] if lobe == "left" else ct["right_lobe_ml"]
        grwr = graft / (w * 10)
        keep = (ct["right_lobe_ml"] if lobe == "left" else ct["left_lobe_ml"]) / ct["liver_volume_ml"]
        if grwr < rules["grwr_min"]:
            return {"result": "positive", "antibody": f"GRWR {grwr:.2f}%",
                    "detail": f"CT volumetry: {lobe} lobe is {graft} ml, only {grwr:.2f}% of the patient's {w} kg "
                              f"(needs at least {rules['grwr_min']}%), so the graft is too small"}
        if keep < rules["remnant_min"]:
            return {"result": "positive", "antibody": f"remnant {keep:.0%}",
                    "detail": f"CT volumetry: the donor would keep only {keep:.0%} of their liver "
                              f"(needs at least {rules['remnant_min']:.0%})"}
        return {"result": "negative"}

    def learn_after_failure(self, donor_pair: str, patient_pair: str, hospital_of) -> None:
        """The work-up measured the donor's liver: share the CT volumes and rebuild only that donor's links."""
        ct = self.measured(donor_pair, hospital_of(donor_pair))
        if not ct:
            return
        db.raw("MATCH (:Pair {pair_id: $id})-[e:CAN_GIVE_TO {status: 'live'}]->() "
               "WHERE coalesce(e.lab_negative, false) = false DELETE e", {"id": donor_pair})
        db.raw("MATCH (:Pair {pair_id: $id})-[:HAS_DONOR]->(:Donor)-[:HAS_LIVER]->(lv:LiverProfile) "
               "SET lv += $ct, lv.volumetry = 'ct'", {"id": donor_pair, "ct": ct})
        self.build_edges(donor_pair)

    def priority(self, patient: dict, weights: dict) -> float:
        return weights["urgent_meld"] if (patient.get("meld") or 0) >= self.params()["urgent_meld"] else 0.0

    def own_clash(self, family: dict) -> str:
        return own_clash(family["donor_abo"], family["patient_abo"], family.get("liver"), family.get("patient_weight_kg"))

    def background(self, n: int, hospitals: list[str], seed: int) -> list:
        return LiverGenerator(seed).pairs(n, hospitals, start=5000)

    def passed_event(self, donor_city: str, patient_city: str, route: str, link: str) -> str:
        return f"{donor_city} donor work-up: CT volumetry confirms the graft on {route} ({link})."

    def failed_event(self, donor_city: str, patient_city: str, link: str, res: dict) -> str:
        return f"{donor_city} donor work-up failed link {link}: {res.get('detail')}. Loop paused, matching agent notified."

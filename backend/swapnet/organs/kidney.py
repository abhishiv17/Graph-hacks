"""Kidney: blood groups, then a virtual crossmatch (patient antibodies vs donor HLA). Each link gets a
lab crossmatch; a positive one reveals the donor's untyped loci, which the pool then learns."""
from swapnet import config
from swapnet.agents import lab
from swapnet.gen.generator import Generator, abo_ok
from swapnet.graph import db
from swapnet.organs.base import Organ


class Kidney(Organ):
    name = "kidney"
    prefix = "S-"
    params_file = "india_kidney.yaml"
    edge_query = "Q02_build_edges_for_pair"
    test_kind = "crossmatch"
    test_name = "lab crossmatch"
    failure_cause = "positive_xm"
    passed_reason = "lab crossmatch negative"
    risk_reason_markers = ("lab crossmatch", "not typed")
    hold_reason = "incoming link has an untyped locus"
    texts = {}   # narrate.T is written for kidney
    integrity_query = "Q28_integrity_kidney"

    def edge_params(self) -> dict:
        return config.edge_params()

    def rules(self) -> list[dict]:
        return super().rules() + [
            {"code": "VIRTUAL_CROSSMATCH_CLEAR",
             "text": f"no patient antibody at or above {config.params()['mfi_threshold']} MFI against a typed donor antigen",
             "source": "program configuration (Biro 2019, data/params/india_kidney.yaml)"},
            {"code": "LAB_CROSSMATCH", "text": "every link has a negative lab crossmatch before committee",
             "source": "program workflow"}]

    def constraints(self, link: dict) -> tuple[list[str], list[str]]:
        done, flags = super().constraints(link)
        done.append("VIRTUAL_CROSSMATCH_CLEAR")
        if link.get("test_passed"):
            done.append("LAB_CROSSMATCH")
        if link.get("vxm") == "risk":
            flags.append("UNTYPED_LOCUS: a donor locus was not typed in advance, so the lab crossmatch decides")
        return done, flags

    def run_test(self, donor_pair: str, donor_hospital: str, patient_pair: str) -> dict:
        return lab.crossmatch(donor_pair, donor_hospital, patient_pair)

    def learn_after_failure(self, donor_pair: str, patient_pair: str, hospital_of) -> None:
        """The lab now knows the donor's full typing: type it, rebuild only that donor's links, and let the
        lab's failure history lower the estimate for its other untyped donors (Q17)."""
        full = db.raw("MATCH (:Pair {pair_id: $id})-[:DONOR]->(d:Person) RETURN d.full_typing AS t",
                      {"id": donor_pair}, graph=config.hospital_graph(hospital_of(donor_pair)))[0]["t"]
        db.raw("MATCH (:Pair {pair_id: $id})-[e:CAN_GIVE_TO {status: 'live'}]->() "
               "WHERE coalesce(e.lab_negative, false) = false DELETE e", {"id": donor_pair})
        db.raw("""MATCH (:Pair {pair_id: $id})-[:HAS_DONOR]->(d:Donor)
                  SET d.untyped_loci = []
                  WITH d UNWIND $dq AS n
                  MERGE (h:HLAAntigen {name: n}) ON CREATE SET h.locus = 'DQ'
                  MERGE (d)-[:HAS_ANTIGEN]->(h)""",
               {"id": donor_pair, "dq": [a for a in full if a.startswith("DQ")]})
        self.build_edges(donor_pair)
        db.run("Q17_failure_priors", {"lab": hospital_of(patient_pair) + "-LAB"})

    def priority(self, patient: dict, weights: dict) -> float:
        return (weights["blood_o_patient"] if patient["abo"] == "O" else 0) + (weights["high_cpra"] if (patient["cpra"] or 0) > 85 else 0)

    def own_clash(self, family: dict) -> str:
        return "blood groups clash" if not abo_ok(family["donor_abo"], family["patient_abo"]) else "tissue-type clash"

    def background(self, n: int, hospitals: list[str], seed: int) -> list:
        return Generator(seed).pairs(n, hospitals, start=1000)

    def passed_event(self, donor_city: str, patient_city: str, route: str, link: str) -> str:
        return f"{patient_city} lab: negative crossmatch on {route} ({link})."

    def failed_event(self, donor_city: str, patient_city: str, link: str, res: dict) -> str:
        return (f"{patient_city} lab: positive crossmatch on link {link} ({res.get('antibody')} antibody, "
                f"MFI {res.get('mfi')}). Loop paused, matching agent notified.")

"""Simulated HLA lab. The real crossmatch sees the donor's full typing, including loci the
hospital never typed in advance, which is why a clear virtual test can still fail."""
from swapnet import config
from swapnet.graph import db


def crossmatch(donor_pair: str, donor_hospital: str, patient_pair: str) -> dict:
    full = db.raw("MATCH (:Pair {pair_id: $id})-[:DONOR]->(d:Person) RETURN d.full_typing AS t",
                  {"id": donor_pair}, graph=config.hospital_graph(donor_hospital))
    typing = set(full[0]["t"] or []) if full else set()
    abs_ = db.raw("MATCH (:Pair {pair_id: $id})-[:HAS_PATIENT]->(:Patient)-[k:HAS_ANTIBODY]->(a:Antibody) "
                  "WHERE k.mfi >= $mfi RETURN a.specificity AS s, k.mfi AS mfi",
                  {"id": patient_pair, "mfi": config.params()["mfi_threshold"]})
    hits = [a for a in abs_ if a["s"] in typing]
    if hits:
        h = max(hits, key=lambda a: a["mfi"])
        return {"result": "positive", "antibody": h["s"], "mfi": h["mfi"]}
    return {"result": "negative"}

"""Hospital intake writes to its private graph; consented, near-relative pairs are published
(de-identified) into the shared exchange graph, then only their own edges are built."""
import time

from swapnet import config
from swapnet.gen.generator import Pair
from swapnet.graph import db

DAY_MS = 86_400_000


def write_private(pr: Pair) -> None:
    g = config.hospital_graph(pr.hospital)
    db.raw(
        """
        MERGE (p:Pair {pair_id: $id}) SET p.consent_shared = true, p.published = false
        MERGE (d:Person {pair_id: $id, role: 'donor'}) SET d.name = $dname, d.nationality = 'IN', d.phone_hash = $phone
        MERGE (r:Person {pair_id: $id, role: 'patient'}) SET r.name = $rname, r.nationality = 'IN', r.phone_hash = $phone
        MERGE (p)-[:DONOR]->(d) MERGE (p)-[:PATIENT]->(r)
        SET d.full_typing = $full
        MERGE (d)-[k:NEAR_RELATIVE_OF]->(r) SET k.relation = $rel
        MERGE (p)-[:REQUIRES_APPROVAL]->(a:Approval {pair_id: $id})
        SET a.stage = 'document_verification', a.opened_at = $opened, a.due = $due, a.status = 'open'
        WITH p
        UNWIND $docs AS doc
        MERGE (p)-[:NEEDS_DOC]->(x:Document {pair_id: $id, type: doc.type}) SET x.status = doc.status
        """,
        {
            "id": pr.pair_id, "dname": f"Synthetic donor {pr.pair_id}", "rname": f"Synthetic patient {pr.pair_id}",
            "phone": pr.phone_hash, "rel": pr.donor["relation"],
            "full": [a["name"] for a in pr.antigens],
            "opened": _opened(pr), "due": _opened(pr) + config.hospitals()["approval_target_days"] * DAY_MS,
            "docs": [{"type": k, "status": v} for k, v in pr.documents.items()],
        },
        graph=g,
    )


def _opened(pr: Pair) -> int:
    return int(time.time() * 1000) - pr.approval_age_days * DAY_MS


def can_publish(pr: Pair) -> tuple[bool, str]:
    rel = db.raw(
        "MATCH (:Pair {pair_id: $id})-[:DONOR]->(d:Person)-[k:NEAR_RELATIVE_OF]->(r:Person) "
        "RETURN k.relation AS rel, d.nationality AS dn, r.nationality AS rn",
        {"id": pr.pair_id}, graph=config.hospital_graph(pr.hospital))
    if not rel:
        return False, "no relationship recorded"
    r = rel[0]
    if r["rel"] not in config.hospitals()["near_relatives"]:
        return False, f"{r['rel']} is not a near relative under THOTA"
    if r["dn"] != "IN" or r["rn"] != "IN":
        return False, "swaps with foreign nationals are not allowed"
    return True, "ok"


def publish(pr: Pair, build_edges: bool = True) -> dict:
    ok, why = can_publish(pr)
    if not ok:
        return {"published": False, "reason": why}
    h = next(x for x in config.hospitals()["hospitals"] if x["code"] == pr.hospital)
    docs_missing = [k for k, v in pr.documents.items() if v != "verified"]
    pair = {
        "organ": "kidney", "status": "waiting", "entered_at": int(time.time() * 1000) - pr.approval_age_days * DAY_MS,
        "approval_state": "docs_verified" if not docs_missing else "submitted",
        "approval_opened": _opened(pr), "approval_due": _opened(pr) + config.hospitals()["approval_target_days"] * DAY_MS,
        "priority": 0.0, "failed_count": 0,
    }
    rows = db.run("Q01_upsert_pair", {
        "pair_id": pr.pair_id, "expected_version": 0, "pair": pair,
        "hospital": {"code": h["code"], "city": h["city"], "lat": h["lat"], "lon": h["lon"], "lab": h["lab"]},
        "donor": pr.donor, "patient": pr.patient,
        # Untyped loci are invisible to the virtual test; the lab still sees them.
        "antigens": [a for a in pr.antigens if a["locus"] not in pr.donor["untyped_loci"]],
        "antibodies": pr.antibodies,
    })
    db.raw("MATCH (p:Pair {pair_id: $id}) SET p.published = true", {"id": pr.pair_id},
           graph=config.hospital_graph(pr.hospital))
    edges = build(pr.pair_id) if build_edges else 0
    if not rows:
        return {"published": False, "reason": "already registered in the shared pool"}
    return {"published": True, "edges": edges}


def build(pair_id: str) -> int:
    rows = db.run("Q02_build_edges_for_pair", {"pair_id": pair_id, **config.edge_params()})
    return rows[0]["edges"] if rows else 0


def documents(pair_id: str, hospital: str) -> list[dict]:
    return db.run("Q15b_documents", {"pair_id": pair_id}, graph=config.hospital_graph(hospital))

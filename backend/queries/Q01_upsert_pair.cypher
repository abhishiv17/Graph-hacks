// Publish one de-identified pair into the exchange graph, with an optimistic version check.
// Returns nothing if the stored version differs from $expected_version (a conflict).
MERGE (p:Pair {pair_id: $pair_id})
ON CREATE SET p.version = 0
WITH p WHERE p.version = $expected_version
SET p += $pair, p.version = p.version + 1
MERGE (h:Hospital {code: $hospital.code})
ON CREATE SET h += $hospital
MERGE (p)-[:REGISTERED_AT]->(h)
MERGE (p)-[:HAS_DONOR]->(d:Donor {pair_id: $pair_id})
SET d += $donor
MERGE (p)-[:HAS_PATIENT]->(r:Patient {pair_id: $pair_id})
SET r += $patient
WITH p, d, r
MATCH (db:BloodGroup {t: $donor.abo}), (rb:BloodGroup {t: $patient.abo})
MERGE (d)-[:HAS_ABO]->(db)
MERGE (r)-[:HAS_ABO]->(rb)
WITH p, d, r
FOREACH (a IN $antigens |
  MERGE (h:HLAAntigen {name: a.name}) ON CREATE SET h.locus = a.locus
  MERGE (d)-[:HAS_ANTIGEN]->(h))
FOREACH (ab IN $antibodies |
  MERGE (h:HLAAntigen {name: ab.name}) ON CREATE SET h.locus = ab.locus
  MERGE (x:Antibody {specificity: ab.name})
  MERGE (x)-[:REACTS_WITH]->(h)
  MERGE (r)-[k:HAS_ANTIBODY]->(x) SET k.mfi = ab.mfi)
RETURN p.pair_id AS pair_id, p.version AS version

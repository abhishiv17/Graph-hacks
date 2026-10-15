// A family broken into its parts, for the explorer: the patient and the donor, the patient's antibodies (with strength)
// and the antigens each one reacts with, the donor's tissue antigens, their blood groups, the hospital, and a liver
// donor's profile. Whether the donor's blood group can give to their own patient comes from the ABO_OK edge. Antibodies
// are gathered first: aggregating them after several OPTIONAL MATCHes on other nodes dropped them. Read-only.
MATCH (p:Pair {pair_id: $pair_id})-[:HAS_DONOR]->(d:Donor), (p)-[:HAS_PATIENT]->(r:Patient), (p)-[:REGISTERED_AT]->(h:Hospital)
OPTIONAL MATCH (r)-[k:HAS_ANTIBODY]->(ab:Antibody)
OPTIONAL MATCH (ab)-[:REACTS_WITH]->(t:HLAAntigen)
WITH p, d, r, h, ab, k, collect(DISTINCT t.name) AS targets
WITH p, d, r, h, collect(CASE WHEN ab IS NULL THEN null ELSE {name: ab.specificity, mfi: k.mfi, reacts_with: targets} END) AS antibodies
OPTIONAL MATCH (d)-[:HAS_ANTIGEN]->(ag:HLAAntigen)
WITH p, d, r, h, antibodies, collect(DISTINCT {name: ag.name, locus: ag.locus}) AS antigens
OPTIONAL MATCH (d)-[:HAS_ABO]->(dg:BloodGroup)
OPTIONAL MATCH (r)-[:HAS_ABO]->(rg:BloodGroup)
OPTIONAL MATCH (dg)-[ok:ABO_OK]->(rg)
OPTIONAL MATCH (d)-[:HAS_LIVER]->(lv:LiverProfile)
RETURN p.pair_id AS pair_id, p.organ AS organ, p.status AS status, p.approval_state AS approval_state,
       h.code AS code, h.city AS city, properties(d) AS donor, properties(r) AS patient,
       dg.t AS donor_abo, rg.t AS patient_abo, ok IS NOT NULL AS own_abo_ok,
       CASE WHEN lv IS NULL THEN null ELSE properties(lv) END AS liver, antigens, antibodies

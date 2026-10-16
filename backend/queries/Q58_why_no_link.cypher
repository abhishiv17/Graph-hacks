// Why one family's donor can't give to another family's patient, from the graph: the ABO_OK edge between their blood
// groups, the patient's antibodies (at or above $mfi) that react with an antigen the donor carries, a remembered FAILED
// link, the live CAN_GIVE_TO link if there is one, and, for liver, the donor's profile and the patient's weight.
// Antibodies are gathered before the other OPTIONAL MATCHes (aggregating them later dropped rows). Read-only.
MATCH (a:Pair {pair_id: $donor_pair})-[:HAS_DONOR]->(d:Donor), (b:Pair {pair_id: $patient_pair})-[:HAS_PATIENT]->(t:Patient)
OPTIONAL MATCH (t)-[k:HAS_ANTIBODY]->(ab:Antibody)-[:REACTS_WITH]->(h:HLAAntigen)<-[:HAS_ANTIGEN]-(d)
WHERE k.mfi >= $mfi
WITH a, b, d, t, collect(DISTINCT h.name) AS clash
OPTIONAL MATCH (d)-[:HAS_ABO]->(dg:BloodGroup)
OPTIONAL MATCH (t)-[:HAS_ABO]->(tg:BloodGroup)
OPTIONAL MATCH (dg)-[ok:ABO_OK]->(tg)
OPTIONAL MATCH (a)-[f:FAILED]->(b)
OPTIONAL MATCH (a)-[e:CAN_GIVE_TO]->(b)
OPTIONAL MATCH (d)-[:HAS_LIVER]->(lv:LiverProfile)
RETURN a.organ AS donor_organ, b.organ AS patient_organ, b.status AS patient_status, dg.t AS donor_abo, tg.t AS patient_abo,
       ok IS NOT NULL AS abo_ok, clash, f.cause AS failed_cause, f.detail AS failed_detail,
       e IS NOT NULL AS linked, e.status AS link_status, t.weight_kg AS patient_weight_kg,
       CASE WHEN lv IS NULL THEN null ELSE properties(lv) END AS liver

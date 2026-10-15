// Shared exchange facts for every pair in one program ($organ = 'kidney' or 'liver'; null = every program), for the
// pool table and the program APIs. De-identified: names, documents and clinical notes stay in hosp_<city>.
// Kidney facts: cPRA, untyped loci, crossmatch results. Liver facts: MELD, weight, volumetry and evaluation statuses.
MATCH (p:Pair)-[:REGISTERED_AT]->(h:Hospital)
WHERE ($organ IS NULL OR p.organ = $organ) AND ($ids IS NULL OR p.pair_id IN $ids)
WITH p, h
MATCH (p)-[:HAS_DONOR]->(d:Donor), (p)-[:HAS_PATIENT]->(r:Patient)
OPTIONAL MATCH (d)-[:HAS_LIVER]->(lv:LiverProfile)
OPTIONAL MATCH (p)-[:IN_LOOP]->(l:Loop) WHERE l.status IN $active
WITH p, h, d, r, lv, head(collect(l.loop_id)) AS loop_id
// Live link counts come from Q31_pair_link_counts: FalkorDB mis-counted them when chained here.
OPTIONAL MATCH (x:Crossmatch)-[:PATIENT_OF]->(p)
WITH p, h, d, r, lv, loop_id, collect(x.result) AS tests
RETURN p.pair_id AS pair_id, p.organ AS organ, h.code AS code, h.city AS city, p.status AS status,
       p.approval_state AS approval_state, coalesce(p.failed_count, 0) AS failed_count,
       d.abo AS donor_abo, d.relation AS donor_relation, r.abo AS patient_abo,
       r.cpra AS cpra, d.untyped_loci AS untyped_loci,
       r.meld AS meld, r.weight_kg AS patient_weight_kg,
       lv.volumetry AS volumetry, lv.anatomy_review AS anatomy_review, lv.donor_evaluation AS donor_evaluation,
       r.recipient_evaluation AS recipient_evaluation, r.surgical_review AS surgical_review,
       loop_id, tests
ORDER BY pair_id

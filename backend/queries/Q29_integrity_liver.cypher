// Liver program completeness checks: liver profile, graft-size confirmation, and the evaluation and review statuses
// of families in loops in play. Workflow checks only; statuses are program configuration, not diagnoses.
// (A WITH follows each filtered MATCH: in FalkorDB a MATCH straight after a WHERE can drop that filter.)
MATCH (p:Pair {organ: 'liver'})-[:HAS_DONOR]->(d:Donor) WHERE NOT (d)-[:HAS_LIVER]->(:LiverProfile)
RETURN 'missing_liver_profile' AS check, 'error' AS severity, p.pair_id AS ref, 'liver' AS organ,
       'Liver donor has no liver profile in the shared pool' AS detail
UNION
MATCH (l:Loop {organ: 'liver'}) WHERE l.status IN ['committee', 'locked']
WITH l
MATCH (p:Pair)-[:IN_LOOP]->(l), (p)-[:HAS_DONOR]->(:Donor)-[:HAS_LIVER]->(lv:LiverProfile)
WITH l, p, lv WHERE coalesce(lv.volumetry, 'estimate') <> 'ct'
RETURN 'graft_suitability_unconfirmed' AS check, 'error' AS severity, l.loop_id AS ref, 'liver' AS organ,
       p.pair_id + ': graft size is still a height-and-weight estimate at committee stage' AS detail
UNION
MATCH (l:Loop {organ: 'liver'}) WHERE l.status IN ['offered', 'testing', 'committee', 'locked']
WITH l
MATCH (p:Pair)-[:IN_LOOP]->(l), (p)-[:HAS_DONOR]->(:Donor)-[:HAS_LIVER]->(lv:LiverProfile)
WITH l, p, lv WHERE coalesce(lv.anatomy_review, 'UNKNOWN') <> 'ELIGIBLE' OR coalesce(lv.donor_evaluation, 'UNKNOWN') <> 'ELIGIBLE'
RETURN 'donor_review_open' AS check, 'warn' AS severity, l.loop_id AS ref, 'liver' AS organ,
       p.pair_id + ': anatomical review ' + coalesce(lv.anatomy_review, 'UNKNOWN') + ', donor evaluation ' + coalesce(lv.donor_evaluation, 'UNKNOWN') AS detail
UNION
MATCH (l:Loop {organ: 'liver'}) WHERE l.status IN ['offered', 'testing', 'committee', 'locked']
WITH l
MATCH (p:Pair)-[:IN_LOOP]->(l), (p)-[:HAS_PATIENT]->(r:Patient)
WITH l, p, r WHERE coalesce(r.recipient_evaluation, 'UNKNOWN') <> 'ELIGIBLE' OR coalesce(r.surgical_review, 'UNKNOWN') <> 'ELIGIBLE'
RETURN 'recipient_review_open' AS check, 'warn' AS severity, l.loop_id AS ref, 'liver' AS organ,
       p.pair_id + ': recipient evaluation ' + coalesce(r.recipient_evaluation, 'UNKNOWN') + ', surgical suitability review ' + coalesce(r.surgical_review, 'UNKNOWN') AS detail

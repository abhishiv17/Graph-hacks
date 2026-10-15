// One family's own case. Returns only this pair's facts, never another family's.
// Pattern comprehensions anchored at p, so nothing is matched against a null loop.
MATCH (p:Pair {pair_id: $pair_id})-[:REGISTERED_AT]->(h:Hospital)
MATCH (p)-[:HAS_DONOR]->(d:Donor)
WITH p, h, d, ['selected', 'offered', 'testing', 'committee', 'locked'] AS active
WITH p, h, d, active,
     head([(p)-[:IN_LOOP]->(l:Loop) WHERE l.status IN active | l]) AS lp,
     [(p)-[:IN_LOOP]->(l:Loop)<-[:IN_LOOP]-(q:Pair) WHERE l.status IN active AND q <> p | q.pair_id] AS others,
     [(p)<-[:PATIENT_OF]-(x:Crossmatch)-[:IN]->(l:Loop) WHERE l.status IN active | x.result] AS own_tests
RETURN p.pair_id AS pair_id, h.city AS city, p.entered_at AS registered, d.relation AS donor_relation,
       p.status AS status, coalesce(p.failed_count, 0) AS failed_count, p.approval_state AS approval_state, p.approval_due AS approval_due,
       lp.loop_id AS loop_id, lp.kind AS loop_kind, lp.status AS loop_status, lp.created_at AS matched_at,
       CASE WHEN lp IS NULL THEN 0 ELSE size(others) + 1 END AS families, own_tests

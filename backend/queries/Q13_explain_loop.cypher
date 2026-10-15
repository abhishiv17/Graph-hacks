// Explain a loop link by link. Every reason is read from the edge, not written by AI.
MATCH (p:Pair)-[r:IN_LOOP]->(lp:Loop {loop_id: $loop_id})
WITH lp, p ORDER BY r.pos
WITH lp, collect(p) AS ps
UNWIND range(0, size(ps) - 1) AS i
WITH lp, ps[i] AS a, ps[(i + 1) % size(ps)] AS b, i
MATCH (a)-[e:CAN_GIVE_TO]->(b)
MATCH (a)-[:REGISTERED_AT]->(ha:Hospital), (b)-[:REGISTERED_AT]->(hb:Hospital)
MATCH (a)-[:HAS_DONOR]->(d:Donor), (b)-[:HAS_PATIENT]->(r:Patient)
OPTIONAL MATCH (a)-[f:FAILED]->(b)
RETURN i AS pos, a.pair_id AS from_pair, b.pair_id AS to_pair, ha.city AS from_city, hb.city AS to_city, lp.organ AS organ,
       d.abo AS donor_abo, d.relation AS donor_relation, r.abo AS patient_abo,
       e.reasons AS reasons, e.p_success AS p_success, e.vxm AS vxm, e.status AS status,
       e.lobe AS lobe, e.grwr AS grwr, e.remnant_pct AS remnant_pct,
       f.cause AS failed_cause, f.detail AS failed_detail
ORDER BY pos

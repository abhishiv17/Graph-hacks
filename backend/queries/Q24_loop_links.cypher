// Every donation link of the given loops, in order, with the facts the map shows when a link is
// clicked: chance it holds, its reasons, and any failure remembered on it.
MATCH (p:Pair)-[r:IN_LOOP]->(l:Loop) WHERE l.loop_id IN $loop_ids
WITH l, p ORDER BY r.pos
WITH l, collect(p) AS ps
UNWIND range(0, size(ps) - 1) AS i
WITH l, ps[i] AS a, ps[(i + 1) % size(ps)] AS b, i
MATCH (a)-[:HAS_DONOR]->(d:Donor), (b)-[:HAS_PATIENT]->(t:Patient)
OPTIONAL MATCH (a)-[e:CAN_GIVE_TO]->(b)
OPTIONAL MATCH (a)-[f:FAILED]->(b)
RETURN l.loop_id AS loop_id, l.organ AS organ, i AS pos, a.pair_id AS from_pair, b.pair_id AS to_pair,
       d.abo AS donor_abo, d.relation AS donor_relation, t.abo AS patient_abo, t.cpra AS patient_cpra,
       t.meld AS patient_meld, t.weight_kg AS patient_weight_kg, e.lobe AS lobe, e.grwr AS grwr,
       e.p_success AS p_success, coalesce(e.status, 'failed') AS status, e.reasons AS reasons,
       f.cause AS failed_cause, f.detail AS failed_detail
ORDER BY loop_id, pos

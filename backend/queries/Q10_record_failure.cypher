// A link failed. Remember it as an edge, break the loop, release its pairs.
MATCH (a:Pair {pair_id: $donor_pair})-[e:CAN_GIVE_TO]->(b:Pair {pair_id: $patient_pair})
MATCH (lp:Loop {loop_id: $loop_id})
SET e.status = 'failed'
MERGE (a)-[f:FAILED]->(b)
SET f.cause = $cause, f.at = timestamp(), f.detail = $detail, f.test_id = $test_id
CREATE (fl:Failure {failure_id: $failure_id, cause: $cause, at: timestamp(), detail: $detail})
CREATE (fl)-[:BROKE]->(lp)
SET lp.status = 'broken', lp.p_success = 0.0, lp.expected_tx = 0.0, b.failed_count = coalesce(b.failed_count, 0) + 1
WITH lp, fl
// The loop can no longer happen as planned: its other pending tests are moot, so no lab spends a test on them.
OPTIONAL MATCH (moot:Crossmatch {result: 'pending'})-[:IN]->(lp)
WITH lp, fl, collect(moot) AS moot
FOREACH (x IN moot | SET x.result = 'cancelled', x.at = timestamp())
WITH lp, fl
MATCH (p:Pair)-[:IN_LOOP]->(lp)
SET p.status = 'waiting', p.version = p.version + 1
WITH lp, fl, collect(p.pair_id) AS released
OPTIONAL MATCH (x:Crossmatch {test_id: $test_id})
FOREACH (_ IN CASE WHEN x IS NULL THEN [] ELSE [1] END | CREATE (fl)-[:EVIDENCED_BY]->(x))
RETURN released

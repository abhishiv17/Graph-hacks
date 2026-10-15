// Write the optimiser's chosen loops as a Plan with Loop nodes (history is kept).
CREATE (pl:Plan {run_id: $run_id, at: timestamp(), policy: $policy, solve_ms: $solve_ms,
                 optimal: $optimal, expected_tx: $expected_tx, planned_tx: $planned_tx})
WITH pl
UNWIND $loops AS l
CREATE (lp:Loop {loop_id: l.loop_id, kind: l.kind, organ: l.organ, p_success: l.p_success,
                 expected_tx: l.expected_tx, status: 'selected', has_fallback: l.has_fallback, created_at: timestamp()})
CREATE (pl)-[:CONTAINS]->(lp)
WITH lp, l
UNWIND range(0, size(l.pairs) - 1) AS i
MATCH (p:Pair {pair_id: l.pairs[i]})
CREATE (p)-[:IN_LOOP {pos: i}]->(lp)
RETURN count(DISTINCT lp) AS loops

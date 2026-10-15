// Demo patients, hospital graph: a new lab reading arrives for a patient (one simulated week later).
// It starts unassessed; the health watch marks it assessed once it has compared it with what it remembers.
MATCH (p:Pair {pair_id: $pair_id})
CREATE (p)-[:HAS_RESULT]->(r:LabResult {result_id: $result_id, kind: $kind, value: $value, unit: $unit, at: $at,
                                         week: $week, source: $source, assessed: false})
RETURN r.result_id AS result_id

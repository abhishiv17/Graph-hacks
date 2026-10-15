// Failure memory the matching agent reads before it searches: every link the graph remembers as FAILED, only around
// $ids when given (null = the whole pool). Searches only walk live CAN_GIVE_TO links, so these are never proposed
// again, and a family whose earlier test failed gets a priority bonus. Read-only.
MATCH (a:Pair)-[f:FAILED]->(b:Pair)
WHERE $ids IS NULL OR a.pair_id IN $ids OR b.pair_id IN $ids
RETURN a.pair_id AS donor_pair, b.pair_id AS patient_pair, f.cause AS cause, f.at AS at, f.test_id AS test_id
ORDER BY at DESC

// Failure memory around one family: every link the graph remembers as failed where the family is the donor side or
// the patient side, with the test that proved it. These links are never proposed again. Read-only.
MATCH (a:Pair)-[f:FAILED]->(b:Pair)
WHERE a.pair_id = $pair_id OR b.pair_id = $pair_id
OPTIONAL MATCH (fl:Failure)-[:EVIDENCED_BY]->(x:Crossmatch {test_id: f.test_id})
RETURN a.pair_id AS donor_pair, b.pair_id AS patient_pair, f.cause AS cause, f.detail AS detail, f.at AS at,
       f.test_id AS test_id, fl.failure_id AS failure_id
ORDER BY at DESC

// Episodic -> semantic memory: positive tests from a lab on DQ-untyped donors lower
// the success estimate for that lab's future DQ-untyped links.
MATCH (h:Hospital {lab: $lab})<-[:REGISTERED_AT]-(a:Pair)-[f:FAILED {cause: 'positive_xm'}]->()
WITH h, count(f) AS fails
MATCH (h)<-[:REGISTERED_AT]-(a:Pair)-[:HAS_DONOR]->(d:Donor)
WHERE size(d.untyped_loci) > 0
SET a.lab_prior = CASE WHEN 1.0 - 0.05 * fails < 0.7 THEN 0.7 ELSE 1.0 - 0.05 * fails END
RETURN fails, count(a) AS pairs_adjusted

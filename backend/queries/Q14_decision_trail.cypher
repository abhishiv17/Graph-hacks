// Decision memory: what was decided, by whom, approved by whom, based on which facts.
MATCH (dc:Decision)-[:BASED_ON]->(x)
WHERE (x:Loop AND x.loop_id IN $loop_ids) OR (x:Failure AND x.failure_id IN $failure_ids) OR dc.pair_id IN $pair_ids
OPTIONAL MATCH (dc)-[:MADE_BY]->(ag:Agent)
OPTIONAL MATCH (dc)-[:APPROVED_BY]->(hu:Agent)
RETURN DISTINCT dc.decision_id AS id, dc.action AS action, dc.rationale AS rationale, dc.at AS at,
       ag.name AS made_by, hu.name AS approved_by
ORDER BY at DESC

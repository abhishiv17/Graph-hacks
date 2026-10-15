// Agent memory, read side: earlier answered questions about any of these pairs or loops, newest first, with when
// they were learned and the scope they touch (the caller hides any the viewer may not see). Read-only.
MATCH (q:Question)-[:ABOUT]->(x)
WHERE (x:Pair AND x.pair_id IN $ids) OR (x:Loop AND x.loop_id IN $ids)
WITH DISTINCT q
RETURN q.question_id AS question_id, q.text AS question, q.answer AS answer, q.at AS at, q.asked_by AS asked_by,
       q.tools AS tools, q.scope AS scope
ORDER BY at DESC
LIMIT $limit

// Agent memory across sessions: the most recent answered questions, for the Ask screen's history. Read-only.
MATCH (q:Question)
OPTIONAL MATCH (q)-[:ABOUT]->(x)
WITH q, collect(coalesce(x.pair_id, x.loop_id)) AS about
RETURN q.question_id AS question_id, q.text AS question, q.answer AS answer, q.at AS at, q.asked_by AS asked_by,
       q.scope AS scope, about
ORDER BY at DESC
LIMIT $limit

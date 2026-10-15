// Agent memory: store a verified Ask KindRed answer as a Question node linked (ABOUT) to every pair and loop it
// verified, with the hospital/program scope it touches, so a later session can recall it with its date.
CREATE (q:Question {question_id: $question_id, text: $text, answer: $answer, at: timestamp(), asked_by: $asked_by,
                    tools: $tools, scope: $scope})
WITH q
OPTIONAL MATCH (p:Pair) WHERE p.pair_id IN $ids
WITH q, collect(p) AS ps
FOREACH (x IN ps | CREATE (q)-[:ABOUT]->(x))
WITH q
OPTIONAL MATCH (l:Loop) WHERE l.loop_id IN $ids
WITH q, collect(l) AS ls
FOREACH (x IN ls | CREATE (q)-[:ABOUT]->(x))
RETURN q.question_id AS question_id

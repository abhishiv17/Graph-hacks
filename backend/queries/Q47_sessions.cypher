// Agent memory, persona graph: earlier visits to this person's page, newest first, so a new session can say what
// changed since the last one. Read-only.
MATCH (:Person {persona_id: $persona_id})-[:HAD_SESSION]->(s:Session)
RETURN s.session_id AS session_id, s.at AS at, s.week AS week, s.greeting AS greeting
ORDER BY at DESC
LIMIT $limit

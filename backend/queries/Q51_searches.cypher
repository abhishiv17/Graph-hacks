// Agent memory, persona graph: every swap search for this patient, newest first. Read-only.
MATCH (:Person {persona_id: $persona_id})-[:SEARCHED]->(s:Search)
RETURN s.search_id AS search_id, s.at AS at, s.week AS week, s.depth AS depth, s.found AS found, s.total AS total,
       s.loops AS loops, s.by AS by
ORDER BY s.created DESC
LIMIT $limit

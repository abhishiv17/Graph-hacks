// Agent memory, semantic, persona graph: what the agents currently believe about this person. Each fact keeps the
// one it replaced (SUPERSEDES), so the answer carries what changed and when. Read-only.
MATCH (:Person {persona_id: $persona_id})-[:KNOWS]->(f:Fact)
WHERE f.current = true
OPTIONAL MATCH (f)-[:SUPERSEDES]->(old:Fact)
RETURN f.key AS key, f.value AS value, f.text AS text, f.at AS at, old.value AS was, old.text AS was_text, old.at AS was_at
ORDER BY key

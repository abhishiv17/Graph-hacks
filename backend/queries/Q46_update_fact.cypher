// Agent memory, semantic, persona graph: replace what the agents believe about one thing (stage, trend, projection,
// pool options). The old fact stays, marked not current, behind a SUPERSEDES edge, so beliefs have a history.
MATCH (me:Person {persona_id: $persona_id})
OPTIONAL MATCH (me)-[:KNOWS]->(old:Fact {key: $key, current: true})
WITH me, old
WHERE old IS NULL OR old.value <> $value
CREATE (me)-[:KNOWS]->(f:Fact {fact_id: $fact_id, key: $key, value: $value, text: $text, at: $at, current: true})
FOREACH (x IN CASE WHEN old IS NULL THEN [] ELSE [old] END | SET x.current = false CREATE (f)-[:SUPERSEDES]->(x))
RETURN f.fact_id AS fact_id

// Agent memory, persona graph: the ongoing conversation about this patient (Ask KindRed on the patient's page), in
// order. Stored in the graph, so any browser sees the same history. Read-only.
MATCH (:Person {persona_id: $persona_id})-[:SAID]->(m:Message)
RETURN m.message_id AS message_id, m.role AS role, m.text AS text, m.at AS at, m.tools AS tools, m.model AS model, m.memory AS memory
ORDER BY m.at

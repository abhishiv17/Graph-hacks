// Agent memory, persona graph: one turn of the conversation about this patient, from the person or from Ask KindRed.
MATCH (me:Person {persona_id: $persona_id})
CREATE (me)-[:SAID]->(m:Message {message_id: $message_id, role: $role, text: $text, at: $at, tools: $tools, model: $model})
RETURN m.message_id AS message_id

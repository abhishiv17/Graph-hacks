// Agent memory, episodic, persona graph: what the health watch noticed, newest first, with the readings each
// finding rests on (BASED_ON) and the hand-offs it started. Read-only.
MATCH (:Person {persona_id: $persona_id})-[:HAS_FINDING]->(f:Finding)
OPTIONAL MATCH (f)-[:BASED_ON]->(r:Reading)
OPTIONAL MATCH (f)-[:HANDED_OFF]->(h:Handoff)
WITH f, collect(DISTINCT {result_id: r.result_id, value: r.value, at: r.at}) AS readings,
     collect(DISTINCT {task_id: h.task_id, agent: h.agent, action: h.action, status: h.status, detail: h.detail}) AS handoffs
RETURN f.finding_id AS finding_id, f.at AS at, f.week AS week, f.stage AS stage, f.previous_stage AS previous_stage,
       f.text AS text, f.value AS value, f.slope_per_year AS slope_per_year, f.weeks_to_next AS weeks_to_next,
       f.kind AS kind, f.trace AS trace, f.model AS model, f.safety_net AS safety_net, f.action AS action, f.due AS due,
       f.read AS read, readings, handoffs
ORDER BY at DESC
LIMIT $limit

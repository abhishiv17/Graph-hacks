// Exchange graph: the hand-offs about one pair (Task nodes ASSIGNED_TO an agent and ABOUT the pair), newest
// first. This is the shared state agents coordinate through, so a restart loses nothing. Read-only.
MATCH (t:Task)-[:ABOUT]->(:Pair {pair_id: $pair_id})
OPTIONAL MATCH (t)-[:ASSIGNED_TO]->(a:Agent)
RETURN t.task_id AS task_id, t.kind AS kind, t.status AS status, a.name AS agent, t.action AS action,
       t.payload AS payload, t.result AS result, t.created_at AS at, t.done_at AS done_at, t.finding_id AS finding_id
ORDER BY at DESC, task_id

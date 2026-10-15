// Agent memory, procedural, persona graph: the steps the agents follow when this person enters a stage, in order.
// The health watch reads its own playbook from the graph instead of hard-coding it. Read-only.
MATCH (:Person {persona_id: $persona_id})-[:FOLLOWS]->(pb:Playbook {stage: $stage})-[s:STEP]->(st:Step)
RETURN pb.stage AS stage, s.order AS step, st.agent AS agent, st.action AS action, st.what AS what,
       st.in_days AS in_days, st.why AS why
ORDER BY step

// Exchange side of committee readiness: approval state and due date per pair in a loop.
// Document detail comes from each hospital's private graph (Q15b).
MATCH (p:Pair)-[r:IN_LOOP]->(:Loop {loop_id: $loop_id})
MATCH (p)-[:REGISTERED_AT]->(h:Hospital)
RETURN p.pair_id AS pair_id, h.code AS hospital, h.city AS city, p.approval_state AS approval_state,
       p.approval_opened AS opened, p.approval_due AS due
ORDER BY r.pos

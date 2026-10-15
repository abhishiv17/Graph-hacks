// Resolve ids against the graph before anything reasons about them: is each id a pair or a loop, which program is it
// in, and which hospitals does it involve (for access checks). An id that matches nothing comes back with kind null.
UNWIND $ids AS id
OPTIONAL MATCH (p:Pair {pair_id: id})-[:REGISTERED_AT]->(h:Hospital)
OPTIONAL MATCH (l:Loop {loop_id: id})
OPTIONAL MATCH (q:Pair)-[:IN_LOOP]->(l)
OPTIONAL MATCH (q)-[:REGISTERED_AT]->(hq:Hospital)
WITH id, p, h, l, collect(DISTINCT hq.code) AS loop_hospitals
RETURN id,
       CASE WHEN p IS NOT NULL THEN 'pair' WHEN l IS NOT NULL THEN 'loop' ELSE null END AS kind,
       coalesce(p.organ, l.organ) AS organ, p.status AS pair_status, l.status AS loop_status,
       CASE WHEN p IS NOT NULL THEN [h.code] ELSE loop_hospitals END AS hospitals

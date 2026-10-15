// What breaks if a family withdraws: every live loop it belongs to, the other families in that loop, and whether the
// loop's stored 2-way fallback survives without it. Read-only.
MATCH (p:Pair {pair_id: $pair_id})-[:IN_LOOP]->(l:Loop)
WHERE l.status IN ['selected', 'offered', 'testing', 'committee', 'locked']
MATCH (o:Pair)-[r:IN_LOOP]->(l)
WITH p, l, o ORDER BY r.pos
WITH p, l, collect(o.pair_id) AS families
OPTIONAL MATCH (fb:Loop)-[:FALLBACK_FOR]->(l)
OPTIONAL MATCH (q:Pair)-[:IN_LOOP]->(fb)
WITH p, l, families, fb, collect(q.pair_id) AS fallback_pairs
RETURN l.loop_id AS loop_id, l.organ AS organ, l.kind AS kind, l.status AS status, families,
       l.expected_tx AS expected_tx, fb.loop_id AS fallback, fallback_pairs,
       fb IS NOT NULL AND NOT p.pair_id IN fallback_pairs AS fallback_survives

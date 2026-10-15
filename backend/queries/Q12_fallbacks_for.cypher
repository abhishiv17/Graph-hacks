// Stored fallbacks of a broken loop that are still usable: every link live, every pair free.
MATCH (lp:Loop {loop_id: $loop_id})<-[:FALLBACK_FOR]-(fb:Loop)
MATCH (a:Pair)-[r:IN_LOOP]->(fb)
WITH fb, a ORDER BY r.pos
WITH fb, collect(a) AS ps
MATCH (x:Pair)-[e:CAN_GIVE_TO]->(y:Pair)
WHERE x IN ps AND y IN ps
WITH fb, ps, collect(e) AS es
WHERE size(es) = size(ps) AND all(e IN es WHERE e.status = 'live') AND all(p IN ps WHERE p.status = 'waiting')
WITH fb, ps, reduce(x = 1.0, e IN es | x * e.p_success) AS p
RETURN fb.loop_id AS loop_id, [q IN ps | q.pair_id] AS pairs, round(p * 100) / 100.0 AS p_success,
       round(size(ps) * p * 100) / 100.0 AS expected_tx

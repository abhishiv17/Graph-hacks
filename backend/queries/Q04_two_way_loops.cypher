// All 2-way loops among available pairs. Both edge aliases are referenced (the graph engine
// otherwise only checks that some edge exists). id(a) < id(b) removes rotations.
MATCH (a:Pair)-[e1:CAN_GIVE_TO]->(b:Pair)-[e2:CAN_GIVE_TO]->(a)
WHERE id(a) < id(b) AND a.status = 'waiting' AND b.status = 'waiting'
  AND e1.status = 'live' AND e2.status = 'live'
  AND ($ids IS NULL OR a.pair_id IN $ids OR b.pair_id IN $ids)
RETURN [a.pair_id, b.pair_id] AS pairs, [e1.p_success, e2.p_success] AS probs

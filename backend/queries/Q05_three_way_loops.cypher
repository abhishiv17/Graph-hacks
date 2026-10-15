// All 3-way loops a -> b -> c -> a, each listed once (a has the smallest id). Every pair the same organ;
// $organ narrows to one program (null = every organ).
MATCH (a:Pair)-[e1:CAN_GIVE_TO]->(b:Pair)-[e2:CAN_GIVE_TO]->(c:Pair)-[e3:CAN_GIVE_TO]->(a)
WHERE id(a) < id(b) AND id(a) < id(c) AND b <> c
  AND a.organ = b.organ AND b.organ = c.organ AND ($organ IS NULL OR a.organ = $organ)
  AND a.status = 'waiting' AND b.status = 'waiting' AND c.status = 'waiting'
  AND e1.status = 'live' AND e2.status = 'live' AND e3.status = 'live'
  AND ($ids IS NULL OR a.pair_id IN $ids OR b.pair_id IN $ids OR c.pair_id IN $ids)
RETURN [a.pair_id, b.pair_id, c.pair_id] AS pairs, [e1.p_success, e2.p_success, e3.p_success] AS probs

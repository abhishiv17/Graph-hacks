// Local repair: only loops that pass through a released pair. A 3-way loop through a
// released pair stays within 2 hops of it, so the rest of the pool is untouched.
MATCH (a:Pair)-[e1:CAN_GIVE_TO]->(b:Pair)-[e2:CAN_GIVE_TO]->(c:Pair)-[e3:CAN_GIVE_TO]->(a)
WHERE a.pair_id IN $released AND id(b) <> id(c) AND a.organ = b.organ AND b.organ = c.organ
  AND a.status = 'waiting' AND b.status = 'waiting' AND c.status = 'waiting'
  AND e1.status = 'live' AND e2.status = 'live' AND e3.status = 'live'
RETURN [a.pair_id, b.pair_id, c.pair_id] AS pairs, [e1.p_success, e2.p_success, e3.p_success] AS probs
UNION
MATCH (a:Pair)-[e1:CAN_GIVE_TO]->(b:Pair)-[e2:CAN_GIVE_TO]->(a)
WHERE a.pair_id IN $released AND a.organ = b.organ AND a.status = 'waiting' AND b.status = 'waiting'
  AND e1.status = 'live' AND e2.status = 'live'
RETURN [a.pair_id, b.pair_id] AS pairs, [e1.p_success, e2.p_success] AS probs

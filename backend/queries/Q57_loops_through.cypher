// Every 2-way and 3-way swap loop through one family over live links, whatever stage the other families are at: the
// explorer shows a swap closing back to the family at hop 2 (2-way) or hop 3 (3-way). Edge aliases are all referenced
// (FalkorDB otherwise only checks that some edge exists). Read-only.
MATCH (c:Pair {pair_id: $pair_id})-[e1:CAN_GIVE_TO]->(b:Pair)-[e2:CAN_GIVE_TO]->(c)
WHERE e1.status = 'live' AND e2.status = 'live'
RETURN [c.pair_id, b.pair_id] AS pairs, [e1.p_success, e2.p_success] AS probs
UNION
MATCH (c:Pair {pair_id: $pair_id})-[e1:CAN_GIVE_TO]->(b:Pair)-[e2:CAN_GIVE_TO]->(x:Pair)-[e3:CAN_GIVE_TO]->(c)
WHERE id(b) <> id(x) AND e1.status = 'live' AND e2.status = 'live' AND e3.status = 'live'
RETURN [c.pair_id, b.pair_id, x.pair_id] AS pairs, [e1.p_success, e2.p_success, e3.p_success] AS probs

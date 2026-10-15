// Live CAN_GIVE_TO links per pair, in each direction, inside one program ($organ; null = every program):
// how many patients a pair's donor could give to, and how many donors could give to its patient.
MATCH (p:Pair)-[o:CAN_GIVE_TO]->(t:Pair)
WHERE o.status = 'live' AND ($organ IS NULL OR p.organ = $organ)
RETURN p.pair_id AS pair_id, 'gives_to' AS dir, count(DISTINCT t) AS n
UNION
MATCH (s:Pair)-[i:CAN_GIVE_TO]->(p:Pair)
WHERE i.status = 'live' AND ($organ IS NULL OR p.organ = $organ)
RETURN p.pair_id AS pair_id, 'receives_from' AS dir, count(DISTINCT s) AS n

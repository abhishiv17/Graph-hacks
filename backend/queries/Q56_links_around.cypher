// Live donation links out of a set of families (what their donors can give) and, when $to is given, only into that
// set: the explorer's hops. Hop 1 is the links out of and into one family; hop 2 and 3 follow the same edges one step
// further. Each link carries its chance and the reasons stored on it. Read-only.
MATCH (a:Pair)-[e:CAN_GIVE_TO]->(b:Pair)
WHERE e.status = 'live' AND ($from IS NULL OR a.pair_id IN $from) AND ($to IS NULL OR b.pair_id IN $to)
RETURN a.pair_id AS from_pair, b.pair_id AS to_pair, e.p_success AS p, e.reasons AS reasons, b.status AS to_status,
       a.status AS from_status
ORDER BY p DESC
LIMIT $limit

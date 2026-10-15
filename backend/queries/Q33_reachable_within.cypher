// Multi-hop reach: which waiting families of the same program a family's donor can reach in at most $hops donations
// (1 to 3) over live links, with the shortest route found to each. Depth is a parameter, so the same question can be
// asked at depth 1 and depth 3. FalkorDB doesn't take a parameter as a path bound, hence *1..3 plus the length filter.
MATCH (a:Pair {pair_id: $pair_id})
MATCH path = (a)-[:CAN_GIVE_TO*1..3]->(b:Pair)
WHERE length(path) <= $hops AND b <> a AND b.status = 'waiting' AND b.organ = a.organ
  AND all(e IN relationships(path) WHERE e.status = 'live')
WITH b, min(length(path)) AS hops, collect(path) AS paths
WITH b, hops, [x IN paths WHERE length(x) = hops][0] AS route
RETURN b.pair_id AS pair_id, hops, [n IN nodes(route) | n.pair_id] AS route
ORDER BY hops, pair_id
LIMIT $limit

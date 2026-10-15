// How two families of the same program are connected: the shortest chain of compatibility links from one family's
// donor to the other family's patient (any link status; the caller reports failed links on the route). Read-only.
MATCH (a:Pair {pair_id: $from_pair}), (b:Pair {pair_id: $to_pair})
WHERE a.organ = b.organ
RETURN [n IN nodes(shortestPath((a)-[:CAN_GIVE_TO*1..6]->(b))) | n.pair_id] AS route

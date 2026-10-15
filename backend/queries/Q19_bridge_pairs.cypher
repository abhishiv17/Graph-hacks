// Pairs whose withdrawal would break the most loops (betweenness centrality).
CALL algo.betweenness({nodeLabels: ['Pair'], relationshipTypes: ['CAN_GIVE_TO']}) YIELD node, score
WHERE node.status = 'waiting'
RETURN node.pair_id AS pair_id, score ORDER BY score DESC LIMIT $limit

// Weakly connected components of the compatibility graph: independent sub-problems.
CALL algo.WCC({nodeLabels: ['Pair'], relationshipTypes: ['CAN_GIVE_TO']}) YIELD node, componentId
WHERE node.status = 'waiting'
RETURN componentId AS component, collect(node.pair_id) AS pairs

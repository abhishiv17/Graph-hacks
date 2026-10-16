// How easy each waiting family is to place in a swap: PageRank over CAN_GIVE_TO. A link points from a family whose
// donor can give to a family whose patient can receive, so a family's score is high when many donors can reach its
// patient, and those donors are themselves easy to reach. Low scores are the hardest patients to match. Read-only.
CALL algo.pageRank('Pair', 'CAN_GIVE_TO') YIELD node, score
WHERE node.status = 'waiting' AND ($organ IS NULL OR node.organ = $organ)
RETURN node.pair_id AS pair_id, node.organ AS organ, score
ORDER BY score DESC

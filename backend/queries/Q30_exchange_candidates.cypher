// Possible donations to and from one pair inside its own program: the live CAN_GIVE_TO edges with their reasons.
// $organ is required and must equal the pair's organ, so a caller can never read across programs.
MATCH (p:Pair {pair_id: $pair_id}) WHERE p.organ = $organ
OPTIONAL MATCH (p)-[o:CAN_GIVE_TO {status: 'live'}]->(t:Pair) WHERE t.organ = $organ
WITH p, collect(CASE WHEN t IS NULL THEN null ELSE {to_pair: t.pair_id, p_success: o.p_success, reasons: o.reasons} END) AS gives
OPTIONAL MATCH (s:Pair)-[i:CAN_GIVE_TO {status: 'live'}]->(p) WHERE s.organ = $organ
RETURN p.pair_id AS pair_id, p.organ AS organ, gives,
       collect(CASE WHEN s IS NULL THEN null ELSE {from_pair: s.pair_id, p_success: i.p_success, reasons: i.reasons} END) AS receives

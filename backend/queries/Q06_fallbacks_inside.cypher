// For a 3-way loop, find a reverse edge that makes a 2-way loop inside it (a back-arc).
// If the third pair drops out, the 2-way can still go ahead.
UNWIND $loops AS l
MATCH (x:Pair {pair_id: l[0]}), (y:Pair {pair_id: l[1]}), (z:Pair {pair_id: l[2]})
OPTIONAL MATCH (y)-[f1:CAN_GIVE_TO {status:'live'}]->(x)
OPTIONAL MATCH (z)-[f2:CAN_GIVE_TO {status:'live'}]->(y)
OPTIONAL MATCH (x)-[f3:CAN_GIVE_TO {status:'live'}]->(z)
RETURN l AS loop,
  CASE WHEN f1 IS NOT NULL THEN [l[0], l[1], f1.p_success] END AS fb_xy,
  CASE WHEN f2 IS NOT NULL THEN [l[1], l[2], f2.p_success] END AS fb_yz,
  CASE WHEN f3 IS NOT NULL THEN [l[2], l[0], f3.p_success] END AS fb_zx

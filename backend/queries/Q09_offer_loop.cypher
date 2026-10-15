// Offer a loop to every pair in it. Refuses (returns 0) if any pair is no longer waiting,
// so two agents can never offer the same donor twice.
MATCH (lp:Loop {loop_id: $loop_id})<-[:IN_LOOP]-(p:Pair)
WITH lp, collect(p) AS ps
WHERE all(x IN ps WHERE x.status = 'waiting')
FOREACH (x IN ps | SET x.status = 'offered', x.version = x.version + 1)
SET lp.status = 'offered'
WITH lp, ps
UNWIND ps AS p
CREATE (o:Offer {offer_id: $loop_id + '-' + p.pair_id, response: 'pending', at: timestamp()})
CREATE (o)-[:FOR]->(lp), (o)-[:TO]->(p)
RETURN count(o) AS offers

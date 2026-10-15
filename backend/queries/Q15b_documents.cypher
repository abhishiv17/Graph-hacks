// Hospital graph: documents for one pair (private; never copied to the exchange).
MATCH (:Pair {pair_id: $pair_id})-[:NEEDS_DOC]->(d:Document)
RETURN d.type AS type, d.status AS status ORDER BY type

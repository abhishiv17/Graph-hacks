// Stat tiles for the live pool.
MATCH (p:Pair)
OPTIONAL MATCH (p)-[:HAS_PATIENT]->(r:Patient)
RETURN count(p) AS pairs,
       sum(CASE WHEN p.status = 'waiting' THEN 1 ELSE 0 END) AS waiting,
       sum(CASE WHEN r.abo = 'O' AND p.status = 'waiting' THEN 1 ELSE 0 END) AS o_waiting,
       sum(CASE WHEN r.cpra > 85 THEN 1 ELSE 0 END) AS highly_sensitised

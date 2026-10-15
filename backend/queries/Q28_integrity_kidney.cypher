// Kidney program completeness checks: sensitisation information, and the lab crossmatch on every link of loops in
// play. Workflow checks only; no clinical judgement. (A WITH follows each filtered MATCH: in FalkorDB a MATCH
// straight after a WHERE can drop that filter.)
MATCH (p:Pair {organ: 'kidney'})-[:HAS_PATIENT]->(r:Patient) WHERE r.cpra IS NULL
RETURN 'missing_sensitisation' AS check, 'warn' AS severity, p.pair_id AS ref, 'kidney' AS organ,
       'Patient has no cPRA recorded' AS detail
UNION
MATCH (l:Loop {organ: 'kidney'}) WHERE l.status IN ['offered', 'testing', 'committee', 'locked']
WITH l
MATCH (p:Pair)-[r:IN_LOOP]->(l)
WITH l, p ORDER BY r.pos
WITH l, collect(p) AS ps
UNWIND range(0, size(ps) - 1) AS i
WITH l, ps[i] AS a, ps[(i + 1) % size(ps)] AS b
OPTIONAL MATCH (a)-[e:CAN_GIVE_TO]->(b)
WITH l, a, b, e, [(x:Crossmatch)-[:IN]->(l) WHERE (x)-[:DONOR_OF]->(a) AND (x)-[:PATIENT_OF]->(b) | x.result] AS results
WITH l, a, b, e, results
WHERE NOT 'negative' IN results AND NOT coalesce(e.lab_negative, false)
  AND (l.status IN ['committee', 'locked'] OR e.vxm = 'risk')
RETURN CASE WHEN l.status IN ['committee', 'locked'] THEN 'missing_crossmatch' ELSE 'crossmatch_pending_untyped' END AS check,
       CASE WHEN l.status IN ['committee', 'locked'] THEN 'error' ELSE 'warn' END AS severity,
       l.loop_id AS ref, 'kidney' AS organ,
       a.pair_id + ' → ' + b.pair_id + CASE WHEN l.status IN ['committee', 'locked']
         THEN ' reached committee without a negative lab crossmatch on record'
         ELSE ': donor has untyped loci and the lab crossmatch is not back yet' END AS detail

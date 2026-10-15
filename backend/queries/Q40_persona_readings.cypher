// Demo patients, hospital graph: one patient's readings of one measure (eGFR or MELD), oldest first. The clinical
// history stays in the hospital's private graph; the shared exchange never sees it. Read-only.
MATCH (p:Pair {pair_id: $pair_id})-[:HAS_RESULT]->(r:LabResult {kind: $kind})
RETURN r.result_id AS result_id, r.value AS value, r.unit AS unit, r.at AS at, r.week AS week,
       coalesce(r.assessed, false) AS assessed
ORDER BY r.at

// Shared integrity checks over the exchange graph: references, links, organ isolation, evidence and approvals.
// One row per finding. These are workflow and data-completeness checks, never medical judgements.
// $organ narrows to one program (null = every program); $active lists loop statuses still in play.
MATCH (p:Pair) WHERE ($organ IS NULL OR p.organ = $organ) AND NOT (p)-[:REGISTERED_AT]->(:Hospital)
RETURN 'missing_hospital' AS check, 'error' AS severity, p.pair_id AS ref, p.organ AS organ,
       'Pair is not registered at any hospital' AS detail
UNION
MATCH (p:Pair) WHERE ($organ IS NULL OR p.organ = $organ)
  AND (NOT (p)-[:HAS_DONOR]->(:Donor) OR NOT (p)-[:HAS_PATIENT]->(:Patient))
RETURN 'missing_pair_reference' AS check, 'error' AS severity, p.pair_id AS ref, p.organ AS organ,
       'Pair is missing its donor or patient record' AS detail
UNION
MATCH (a:Pair)-[e:CAN_GIVE_TO]->(b:Pair) WHERE a.organ <> b.organ AND ($organ IS NULL OR a.organ = $organ OR b.organ = $organ)
RETURN 'cross_organ_link' AS check, 'error' AS severity, a.pair_id + ' → ' + b.pair_id AS ref, a.organ AS organ,
       'Link joins a ' + a.organ + ' donor to a ' + b.organ + ' patient' AS detail
UNION
MATCH (p:Pair)-[:IN_LOOP]->(l:Loop) WHERE l.status IN $active AND p.organ <> l.organ AND ($organ IS NULL OR l.organ = $organ)
RETURN 'mixed_organ_loop' AS check, 'error' AS severity, l.loop_id AS ref, l.organ AS organ,
       l.loop_id + ' (' + l.organ + ') contains ' + p.organ + ' pair ' + p.pair_id AS detail
UNION
MATCH (l:Loop) WHERE l.status IN $active AND l.status <> 'broken' AND ($organ IS NULL OR l.organ = $organ)
WITH l
MATCH (p:Pair)-[r:IN_LOOP]->(l)
WITH l, p ORDER BY r.pos
WITH l, collect(p) AS ps
UNWIND range(0, size(ps) - 1) AS i
WITH l, ps[i] AS a, ps[(i + 1) % size(ps)] AS b
OPTIONAL MATCH (a)-[e:CAN_GIVE_TO]->(b)
WITH l, a, b, e WHERE e IS NULL OR (e.status = 'live' AND size(coalesce(e.reasons, [])) = 0)
RETURN CASE WHEN e IS NULL THEN 'broken_link' ELSE 'missing_evidence' END AS check, 'error' AS severity,
       l.loop_id AS ref, l.organ AS organ,
       CASE WHEN e IS NULL THEN 'No compatibility link ' ELSE 'Link has no recorded reasons ' END + a.pair_id + ' → ' + b.pair_id AS detail
UNION
MATCH (p:Pair {status: 'waiting'})-[:IN_LOOP]->(l:Loop) WHERE l.status IN ['offered', 'testing', 'committee', 'locked']
  AND ($organ IS NULL OR l.organ = $organ)
RETURN 'status_mismatch' AS check, 'warn' AS severity, p.pair_id AS ref, l.organ AS organ,
       p.pair_id + ' is marked waiting but sits in ' + l.loop_id + ' (' + l.status + ')' AS detail
UNION
MATCH (old:Loop)-[:REPLACED_BY]->(n:Loop) WHERE ($organ IS NULL OR n.organ = $organ)
OPTIONAL MATCH (d:Decision)-[:BASED_ON]->(old) WHERE d.action IN ['approve_repair', 'use_fallback']
WITH old, n, count(d) AS approvals WHERE approvals = 0
RETURN 'missing_approval' AS check, 'error' AS severity, n.loop_id AS ref, n.organ AS organ,
       n.loop_id + ' replaced ' + old.loop_id + ' without a recorded human approval' AS detail
UNION
MATCH (t:Task {status: 'open'})-[:ABOUT]->(l:Loop) WHERE t.kind IN ['approve_repair', 'escalate'] AND ($organ IS NULL OR l.organ = $organ)
RETURN 'awaiting_human_review' AS check, 'info' AS severity, l.loop_id AS ref, l.organ AS organ,
       'Repair proposal for ' + l.loop_id + ' is waiting for a coordinator decision' AS detail

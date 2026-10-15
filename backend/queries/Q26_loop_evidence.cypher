// Evidence for every link of one loop: the facts written on the CAN_GIVE_TO edge, the pre-surgery test on that
// link (lab crossmatch or donor work-up), and any remembered failure. Explanations may use only these facts.
// The organs of both pairs come back too, so the caller can check the loop never mixed organs.
MATCH (l:Loop {loop_id: $loop_id})
MATCH (p:Pair)-[r:IN_LOOP]->(l)
WITH l, p ORDER BY r.pos
WITH l, collect(p) AS ps
UNWIND range(0, size(ps) - 1) AS i
WITH l, ps[i] AS a, ps[(i + 1) % size(ps)] AS b, i
MATCH (a)-[:HAS_DONOR]->(d:Donor), (b)-[:HAS_PATIENT]->(t:Patient)
OPTIONAL MATCH (a)-[e:CAN_GIVE_TO]->(b)
OPTIONAL MATCH (a)-[f:FAILED]->(b)
OPTIONAL MATCH (x:Crossmatch)-[:IN]->(l), (x)-[:DONOR_OF]->(a), (x)-[:PATIENT_OF]->(b)
RETURN i AS pos, l.organ AS loop_organ, a.pair_id AS from_pair, b.pair_id AS to_pair,
       a.organ AS donor_organ, b.organ AS patient_organ, d.abo AS donor_abo, t.abo AS patient_abo,
       e.status AS edge_status, e.organ AS edge_organ, e.reasons AS reasons, e.p_success AS p_success, e.vxm AS vxm,
       e.lobe AS lobe, e.grwr AS grwr, e.remnant_pct AS remnant_pct, e.anatomy_review AS anatomy_review,
       coalesce(e.lab_negative, false) AS test_passed,
       x.test_id AS test_id, coalesce(x.kind, 'crossmatch') AS test_kind, x.result AS test_result, x.antibody AS finding,
       f.cause AS failed_cause, f.detail AS failed_detail
ORDER BY pos

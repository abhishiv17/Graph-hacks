// Build only this kidney pair's CAN_GIVE_TO edges, in both directions (O(n) per new pair).
// An edge exists when blood groups fit, the virtual test is clear (Q03 logic inline),
// and no FAILED memory edge joins the two pairs. Liver pairs use Q21; organs never mix.
MATCH (n:Pair {pair_id: $pair_id})
MATCH (a:Pair)-[:HAS_DONOR]->(d:Donor)-[:HAS_ABO]->(dg:BloodGroup)-[:ABO_OK]->(pg:BloodGroup)<-[:HAS_ABO]-(r:Patient)<-[:HAS_PATIENT]-(b:Pair)
WHERE (a = n OR b = n) AND a <> b AND a.organ = 'kidney' AND b.organ = 'kidney'
  AND a.status IN ['waiting','offered','testing','locked'] AND b.status IN ['waiting','offered','testing','locked']
  AND NOT (a)-[:FAILED]->(b)
OPTIONAL MATCH (d)-[:HAS_ANTIGEN]->(h:HLAAntigen)<-[:REACTS_WITH]-(:Antibody)<-[k:HAS_ANTIBODY]-(r)
WHERE k.mfi >= $mfi
WITH a, b, d, r, dg, pg, collect(h.name) AS clashes
WHERE size(clashes) = 0
WITH a, b, d, r, dg, pg,
     CASE WHEN r.cpra > 90 THEN 1.0 - $xm_high ELSE 1.0 - $xm_low END AS base,
     size(d.untyped_loci) AS untyped
WITH a, b, d, r, dg, pg, base * (1.0 - $untyped_extra * untyped) * coalesce(a.lab_prior, 1.0) AS p
MERGE (a)-[e:CAN_GIVE_TO]->(b)
WITH e, p, dg, pg, d
WHERE coalesce(e.lab_negative, false) = false   // a link proven by a lab test keeps its evidence
// refusal risk counts only until the receiving hospital accepts the offer on this link
SET e.p_success = round(p * CASE WHEN coalesce(e.offer_accepted, false) THEN 1.0 ELSE 1.0 - $refusal END * 100) / 100.0,
    e.abo_ok = true,
    e.organ = 'kidney',
    e.vxm = CASE WHEN size(d.untyped_loci) > 0 THEN 'risk' ELSE 'clear' END,
    e.status = 'live',
    e.built_at = timestamp(),
    e.reasons = [dg.t + ' → ' + pg.t + CASE WHEN dg.t = pg.t THEN ' · same blood group' WHEN dg.t = 'O' THEN ' · O can give to every blood group' ELSE '' END,
                 'virtual test clear: no antibody at or above ' + toString($mfi) + ' MFI against this donor']
               + CASE WHEN size(d.untyped_loci) > 0 THEN ['donor ' + reduce(s = '', x IN d.untyped_loci | s + x) + ' not typed: higher risk of a positive lab test'] ELSE ['DQ typed'] END
               + CASE WHEN coalesce(e.offer_accepted, false) THEN ['offer accepted: no refusal risk left on this link'] ELSE [] END
RETURN count(e) AS edges

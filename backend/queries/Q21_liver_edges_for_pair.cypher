// Liver links for one pair, in both directions: same graph as kidney, different rule.
// Blood groups first (the ABO_OK traversal), then graft size: GRWR = graft ml / (patient kg x 10) must be
// at least $grwr_min %. The left lobe is the safer operation for the donor and is used when it is big
// enough; the right lobe only if the donor agreed to give it and keeps at least $remnant_min of their liver.
// No FAILED memory edge may join the two pairs. Evaluation statuses are program configuration, not measurements:
// a donor whose anatomical review or donor evaluation is INELIGIBLE gets no links; REVIEW_REQUIRED and UNKNOWN are
// written on the link as reasons for a person to check.
MATCH (n:Pair {pair_id: $pair_id})
MATCH (a:Pair)-[:HAS_DONOR]->(d:Donor)-[:HAS_ABO]->(dg:BloodGroup)-[:ABO_OK]->(pg:BloodGroup)<-[:HAS_ABO]-(r:Patient)<-[:HAS_PATIENT]-(b:Pair)
WHERE (a = n OR b = n) AND a <> b AND a.organ = 'liver' AND b.organ = 'liver'
  AND a.status IN ['waiting','offered','testing','locked'] AND b.status IN ['waiting','offered','testing','locked']
  AND NOT (a)-[:FAILED]->(b)
// This WITH is required: in FalkorDB a MATCH straight after a pattern predicate loses its new variable.
WITH a, b, d, r, dg, pg
MATCH (d)-[:HAS_LIVER]->(lv:LiverProfile)
WHERE coalesce(lv.anatomy_review, 'UNKNOWN') <> 'INELIGIBLE' AND coalesce(lv.donor_evaluation, 'UNKNOWN') <> 'INELIGIBLE'
WITH a, b, r, dg, pg, lv,
     lv.left_lobe_ml / (r.weight_kg * 10.0) AS g_left,
     lv.right_lobe_ml / (r.weight_kg * 10.0) AS g_right,
     toFloat(lv.left_lobe_ml) / lv.liver_volume_ml AS left_share
WITH a, b, r, dg, pg, lv, g_left, g_right, left_share,
     CASE WHEN g_left >= $grwr_min THEN 'left'
          WHEN lv.right_lobe_ok AND g_right >= $grwr_min AND left_share >= $remnant_min THEN 'right' END AS lobe
WHERE lobe IS NOT NULL
WITH a, b, r, dg, pg, lobe, lv.volumetry = 'estimate' AS estimated,
     coalesce(lv.anatomy_review, 'UNKNOWN') AS anat, coalesce(lv.donor_evaluation, 'UNKNOWN') AS deval,
     CASE WHEN lobe = 'left' THEN g_left ELSE g_right END AS grwr,
     CASE WHEN lobe = 'left' THEN 1.0 - left_share ELSE left_share END AS keep,
     CASE WHEN lobe = 'left' THEN lv.left_lobe_ml ELSE lv.right_lobe_ml END AS graft_ml,
     CASE WHEN r.meld > 15 THEN $ill_base + $ill_per_meld * (r.meld - 15) ELSE $ill_base END AS ill
WITH a, b, r, dg, pg, lobe, estimated, anat, deval, grwr, keep, graft_ml,
     estimated AND grwr < $grwr_min * (1 + $margin) AS borderline,
     CASE WHEN ill > $ill_max THEN $ill_max ELSE ill END AS ill
WITH a, b, r, dg, pg, lobe, estimated, anat, deval, grwr, keep, graft_ml, borderline,
     (1.0 - $workup) * (1.0 - ill)
     * (1.0 - CASE WHEN borderline THEN $estimate_borderline WHEN estimated THEN $estimate ELSE 0.0 END) AS p
MERGE (a)-[e:CAN_GIVE_TO]->(b)
WITH e, p, dg, pg, r, lobe, estimated, anat, deval, grwr, keep, graft_ml, borderline
WHERE coalesce(e.lab_negative, false) = false   // a link confirmed by the donor work-up keeps its evidence
// refusal risk counts only until the receiving hospital accepts the offer on this link
SET e.p_success = round(p * CASE WHEN coalesce(e.offer_accepted, false) THEN 1.0 ELSE 1.0 - $refusal END * 100) / 100.0,
    e.abo_ok = true,
    e.organ = 'liver',
    e.anatomy_review = anat,
    e.lobe = lobe,
    e.grwr = round(grwr * 100) / 100.0,
    e.remnant_pct = toInteger(round(keep * 100)),
    e.vxm = CASE WHEN estimated THEN 'risk' ELSE 'clear' END,   // for liver, 'risk' = graft volume not yet measured
    e.status = 'live',
    e.built_at = timestamp(),
    e.reasons = [dg.t + ' → ' + pg.t + CASE WHEN dg.t = pg.t THEN ' · same blood group' WHEN dg.t = 'O' THEN ' · O can give to every blood group' ELSE '' END,
                 lobe + ' lobe, ' + toString(graft_ml) + ' ml, for a ' + toString(r.weight_kg) + ' kg patient: graft is '
                   + toString(round(grwr * 100) / 100.0) + '% of body weight (needs at least ' + toString($grwr_min) + '%)',
                 'donor keeps ' + toString(toInteger(round(keep * 100))) + '% of their liver (needs at least '
                   + toString(toInteger(round($remnant_min * 100))) + '%)']
               + CASE WHEN lobe = 'left' THEN ['left lobe: the smaller operation for the donor'] ELSE [] END
               + CASE WHEN borderline THEN ['liver volume estimated from height and weight, close to the size limit: CT volumetry could rule this link out']
                      WHEN estimated THEN ['liver volume estimated from height and weight; CT volumetry pending']
                      ELSE ['liver volume measured on CT'] END
               + CASE WHEN anat = 'REVIEW_REQUIRED' THEN ['anatomical review (vascular and biliary): review required before surgery']
                      WHEN anat = 'UNKNOWN' THEN ['anatomical review (vascular and biliary): not yet reported'] ELSE [] END
               + CASE WHEN deval <> 'ELIGIBLE' THEN ['donor evaluation: ' + replace(toLower(deval), '_', ' ')] ELSE [] END
               + CASE WHEN r.meld >= $urgent_meld THEN ['patient MELD ' + toString(r.meld) + ': very ill, with a higher chance of becoming too ill to wait'] ELSE [] END
               + CASE WHEN coalesce(e.offer_accepted, false) THEN ['offer accepted: no refusal risk left on this link'] ELSE [] END
RETURN count(e) AS edges

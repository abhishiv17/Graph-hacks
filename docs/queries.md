# KindRed's Cypher queries

Every query KindRed runs against FalkorDB is a named, parameterised file in `backend/queries/`: 59 in all, 45 read-only and 14 that write. No query is built from strings, and the language models never write Cypher: they choose a tool, and each tool runs one of these files. A query with no `CREATE`, `MERGE`, `SET`, `DELETE` or `REMOVE` runs through `GRAPH.RO_QUERY`, so FalkorDB itself refuses a write from it.

This page is generated from the files by `scripts/build-queries-doc.py`; the How it works page (`/graph`) shows the same list with live timings.

## Graph algorithms and multi-hop traversals

| Query | Uses | For |
|---|---|---|
| [`Q07_components`](#q07_components) | `algo.WCC` | Splits the pool into independent parts before matching |
| [`Q19_bridge_pairs`](#q19_bridge_pairs) | `algo.betweenness` | Bridge families whose withdrawal would break the most swaps |
| [`Q59_match_ease`](#q59_match_ease) | `algo.pageRank` | How easy each waiting family is to place, so the hardest can go first |
| [`Q34_connection_path`](#q34_connection_path) | `shortestPath` over `*1..6` | The shortest chain of donations between two families |
| [`Q33_reachable_within`](#q33_reachable_within) | variable-length `*1..3` | Who a family's donor can reach in 1 to 3 donations |
| [`Q11_local_repair_candidates`](#q11_local_repair_candidates) | bounded 2-hop search | Repair candidates only near the families a failure released |

## All queries

| Query | What it does | Read-only |
|---|---|---|
| [`Q00_schema`](#q00_schema) | Indexes and the ABO lookup graph (statements end with a semicolon) | writes |
| [`Q01_upsert_pair`](#q01_upsert_pair) | Publish one de-identified pair into the exchange graph, with an optimistic version check. Returns nothing if the stored version differs from $expected_version (a conflict). | writes |
| [`Q02_build_edges_for_pair`](#q02_build_edges_for_pair) | Build only this kidney pair's CAN_GIVE_TO edges, in both directions (O(n) per new pair). An edge exists when blood groups fit, the virtual test is clear (Q03 logic inline), and no FAILED memory edge joins the two pairs. Liver pairs use Q21; organs never mix. | writes |
| [`Q03_virtual_crossmatch`](#q03_virtual_crossmatch) | Virtual crossmatch: donor antigen <- antibody <- patient, at or above the MFI threshold. | yes |
| [`Q04_two_way_loops`](#q04_two_way_loops) | All 2-way loops among available pairs. Both edge aliases are referenced (the graph engine otherwise only checks that some edge exists). id(a) < id(b) removes rotations. Both pairs must be the same organ (links never cross organs; this is the second guard), and $organ narrows to one program (null = every organ). | yes |
| [`Q05_three_way_loops`](#q05_three_way_loops) | All 3-way loops a -> b -> c -> a, each listed once (a has the smallest id). Every pair the same organ; $organ narrows to one program (null = every organ). | yes |
| [`Q06_fallbacks_inside`](#q06_fallbacks_inside) | For a 3-way loop, find a reverse edge that makes a 2-way loop inside it (a back-arc). If the third pair drops out, the 2-way can still go ahead. | yes |
| [`Q07_components`](#q07_components) | Weakly connected components of the compatibility graph: independent sub-problems. | yes |
| [`Q08_save_plan`](#q08_save_plan) | Write the optimiser's chosen loops as a Plan with Loop nodes (history is kept). | writes |
| [`Q09_offer_loop`](#q09_offer_loop) | Offer a loop to every pair in it. Refuses (returns 0) if any pair is no longer waiting, so two agents can never offer the same donor twice. | writes |
| [`Q10_record_failure`](#q10_record_failure) | A link failed. Remember it as an edge, break the loop, release its pairs. | writes |
| [`Q11_local_repair_candidates`](#q11_local_repair_candidates) | Local repair: only loops that pass through a released pair. A 3-way loop through a released pair stays within 2 hops of it, so the rest of the pool is untouched. | yes |
| [`Q12_fallbacks_for`](#q12_fallbacks_for) | Stored fallbacks of a broken loop that are still usable: every link live, every pair free. | yes |
| [`Q13_explain_loop`](#q13_explain_loop) | Explain a loop link by link. Every reason is read from the edge, not written by AI. | yes |
| [`Q14_decision_trail`](#q14_decision_trail) | Decision memory: what was decided, by whom, approved by whom, based on which facts. | yes |
| [`Q15_loop_committee_readiness`](#q15_loop_committee_readiness) | Exchange side of committee readiness: approval state and due date per pair in a loop. Document detail comes from each hospital's private graph (Q15b). | yes |
| [`Q15b_documents`](#q15b_documents) | Hospital graph: documents for one pair (private; never copied to the exchange). | yes |
| [`Q16_family_status`](#q16_family_status) | One family's own case. Returns only this pair's facts, never another family's. Pattern comprehensions anchored at p, so nothing is matched against a null loop. | yes |
| [`Q17_failure_priors`](#q17_failure_priors) | Episodic -> semantic memory: positive tests from a lab on DQ-untyped donors lower the success estimate for that lab's future DQ-untyped links. | writes |
| [`Q18_events_since`](#q18_events_since) | The "What the agents are doing" feed. | yes |
| [`Q19_bridge_pairs`](#q19_bridge_pairs) | Pairs whose withdrawal would break the most loops (betweenness centrality). | yes |
| [`Q20_pool_summary`](#q20_pool_summary) | Stat tiles for the live pool, overall and per organ. | yes |
| [`Q21_liver_edges_for_pair`](#q21_liver_edges_for_pair) | Liver links for one pair, in both directions: same graph as kidney, different rule. Blood groups first (the ABO_OK traversal), then graft size: GRWR = graft ml / (patient kg x 10) must be at least $grwr_min %. The left lobe is the safer operation for the donor and is used when it is big enough; the right lobe only if the donor agreed to give it and keeps at least $remnant_min of their liver. No FAILED memory edge may join the two pairs. Evaluation statuses are program configuration, not measurements: a donor whose anatomical review or donor evaluation is INELIGIBLE gets no links; REVIEW_REQUIRED and UNKNOWN are written on the link as reasons for a person to check. | writes |
| [`Q24_loop_links`](#q24_loop_links) | Every donation link of the given loops, in order, with the facts the map shows when a link is clicked: chance it holds, its reasons, and any failure remembered on it. | yes |
| [`Q25_program_pairs`](#q25_program_pairs) | Shared exchange facts for every pair in one program ($organ = 'kidney' or 'liver'; null = every program), for the pool table and the program APIs. De-identified: names, documents and clinical notes stay in hosp_<city>. Kidney facts: cPRA, untyped loci, crossmatch results. Liver facts: MELD, weight, volumetry and evaluation statuses. | yes |
| [`Q26_loop_evidence`](#q26_loop_evidence) | Evidence for every link of one loop: the facts written on the CAN_GIVE_TO edge, the pre-surgery test on that link (lab crossmatch or donor work-up), and any remembered failure. Explanations may use only these facts. The organs of both pairs come back too, so the caller can check the loop never mixed organs. | yes |
| [`Q27_integrity_shared`](#q27_integrity_shared) | Shared integrity checks over the exchange graph: references, links, organ isolation, evidence and approvals. One row per finding. These are workflow and data-completeness checks, never medical judgements. $organ narrows to one program (null = every program); $active lists loop statuses still in play. | yes |
| [`Q28_integrity_kidney`](#q28_integrity_kidney) | Kidney program completeness checks: sensitisation information, and the lab crossmatch on every link of loops in play. Workflow checks only; no clinical judgement. (A WITH follows each filtered MATCH: in FalkorDB a MATCH straight after a WHERE can drop that filter.) | yes |
| [`Q29_integrity_liver`](#q29_integrity_liver) | Liver program completeness checks: liver profile, graft-size confirmation, and the evaluation and review statuses of families in loops in play. Workflow checks only; statuses are program configuration, not diagnoses. (A WITH follows each filtered MATCH: in FalkorDB a MATCH straight after a WHERE can drop that filter.) | yes |
| [`Q30_exchange_candidates`](#q30_exchange_candidates) | Possible donations to and from one pair inside its own program: the live CAN_GIVE_TO edges with their reasons. $organ is required and must equal the pair's organ, so a caller can never read across programs. | yes |
| [`Q31_pair_link_counts`](#q31_pair_link_counts) | Live CAN_GIVE_TO links per pair, in each direction, inside one program ($organ; null = every program): how many patients a pair's donor could give to, and how many donors could give to its patient. | yes |
| [`Q32_withdrawal_impact`](#q32_withdrawal_impact) | What breaks if a family withdraws: every live loop it belongs to, the other families in that loop, and whether the loop's stored 2-way fallback survives without it. Read-only. | yes |
| [`Q33_reachable_within`](#q33_reachable_within) | Multi-hop reach: which waiting families of the same program a family's donor can reach in at most $hops donations (1 to 3) over live links, with the shortest route found to each. Depth is a parameter, so the same question can be asked at depth 1 and depth 3. FalkorDB doesn't take a parameter as a path bound, hence *1..3 plus the length filter. | yes |
| [`Q34_connection_path`](#q34_connection_path) | How two families of the same program are connected: the shortest chain of compatibility links from one family's donor to the other family's patient (any link status; the caller reports failed links on the route). Read-only. | yes |
| [`Q35_failure_memory`](#q35_failure_memory) | Failure memory around one family: every link the graph remembers as failed where the family is the donor side or the patient side, with the test that proved it. These links are never proposed again. Read-only. | yes |
| [`Q36_resolve_ids`](#q36_resolve_ids) | Resolve ids against the graph before anything reasons about them: is each id a pair or a loop, which program is it in, and which hospitals does it involve (for access checks). An id that matches nothing comes back with kind null. | yes |
| [`Q37_remember_answer`](#q37_remember_answer) | Agent memory: store a verified Ask KindRed answer as a Question node linked (ABOUT) to every pair and loop it verified, with the hospital/program scope it touches, so a later session can recall it with its date. | writes |
| [`Q38_recall`](#q38_recall) | Agent memory, read side: earlier answered questions about any of these pairs or loops, newest first, with when they were learned and the scope they touch (the caller hides any the viewer may not see). Read-only. | yes |
| [`Q39_recent_questions`](#q39_recent_questions) | Agent memory across sessions: the most recent answered questions, for the Ask screen's history. Read-only. | yes |
| [`Q40_persona_readings`](#q40_persona_readings) | Demo patients, hospital graph: one patient's readings of one measure (eGFR or MELD), oldest first. The clinical history stays in the hospital's private graph; the shared exchange never sees it. Read-only. | yes |
| [`Q41_record_reading`](#q41_record_reading) | Demo patients, hospital graph: a new lab reading arrives for a patient (one simulated week later). It starts unassessed; the health watch marks it assessed once it has compared it with what it remembers. | writes |
| [`Q42_current_facts`](#q42_current_facts) | Agent memory, semantic, persona graph: what the agents currently believe about this person. Each fact keeps the one it replaced (SUPERSEDES), so the answer carries what changed and when. Read-only. | yes |
| [`Q43_findings`](#q43_findings) | Agent memory, episodic, persona graph: what the health watch noticed, newest first, with the readings each finding rests on (BASED_ON) and the hand-offs it started. Read-only. | yes |
| [`Q44_playbook`](#q44_playbook) | Agent memory, procedural, persona graph: the steps the agents follow when this person enters a stage, in order. The health watch reads its own playbook from the graph instead of hard-coding it. Read-only. | yes |
| [`Q45_remember_finding`](#q45_remember_finding) | Agent memory, persona graph: store what the health watch noticed, linked to the readings it used (mirrored from the hospital graph by id) and to the playbook it triggered, if the stage changed. | writes |
| [`Q46_update_fact`](#q46_update_fact) | Agent memory, semantic, persona graph: replace what the agents believe about one thing (stage, trend, projection, pool options). The old fact stays, marked not current, behind a SUPERSEDES edge, so beliefs have a history. | writes |
| [`Q47_sessions`](#q47_sessions) | Agent memory, persona graph: earlier visits to this person's page, newest first, so a new session can say what changed since the last one. Read-only. | yes |
| [`Q48_pair_handoffs`](#q48_pair_handoffs) | Exchange graph: the hand-offs about one pair (Task nodes ASSIGNED_TO an agent and ABOUT the pair), newest first. This is the shared state agents coordinate through, so a restart loses nothing. Read-only. | yes |
| [`Q49_appointments`](#q49_appointments) | Demo patients, hospital graph: one patient's appointments (past visits, and tentative ones the scheduler held), by date. Read-only. | yes |
| [`Q50_record_search`](#q50_record_search) | Agent memory, persona graph: one swap search the agents ran for this patient, at one depth (2 = 2-way only, 3 = 2-way and 3-way), with how many loops it found and the best ones. Kept so a shallow search can be compared with a deeper one, week by week. | writes |
| [`Q51_searches`](#q51_searches) | Agent memory, persona graph: every swap search for this patient, newest first. Read-only. | yes |
| [`Q52_conversation`](#q52_conversation) | Agent memory, persona graph: the ongoing conversation about this patient (Ask KindRed on the patient's page), in order. Stored in the graph, so any browser sees the same history. Read-only. | yes |
| [`Q53_add_message`](#q53_add_message) | Agent memory, persona graph: one turn of the conversation about this patient, from the person or from Ask KindRed. `memory` is JSON: what the answer read from memory, with when each piece was learned (shown next to the answer). | writes |
| [`Q54_failure_memory_around`](#q54_failure_memory_around) | Failure memory the matching agent reads before it searches: every link the graph remembers as FAILED, only around $ids when given (null = the whole pool). Searches only walk live CAN_GIVE_TO links, so these are never proposed again, and a family whose earlier test failed gets a priority bonus. Read-only. | yes |
| [`Q55_family_parts`](#q55_family_parts) | A family broken into its parts, for the explorer: the patient and the donor, the patient's antibodies (with strength) and the antigens each one reacts with, the donor's tissue antigens, their blood groups, the hospital, and a liver donor's profile. Whether the donor's blood group can give to their own patient comes from the ABO_OK edge. Antibodies are gathered first: aggregating them after several OPTIONAL MATCHes on other nodes dropped them. Read-only. | yes |
| [`Q56_links_around`](#q56_links_around) | Live donation links out of a set of families (what their donors can give) and, when $to is given, only into that set: the explorer's hops. Hop 1 is the links out of and into one family; hop 2 and 3 follow the same edges one step further. Each link carries its chance and the reasons stored on it. Read-only. | yes |
| [`Q57_loops_through`](#q57_loops_through) | Every 2-way and 3-way swap loop through one family over live links, whatever stage the other families are at: the explorer shows a swap closing back to the family at hop 2 (2-way) or hop 3 (3-way). Edge aliases are all referenced (FalkorDB otherwise only checks that some edge exists). Read-only. | yes |
| [`Q58_why_no_link`](#q58_why_no_link) | Why one family's donor can't give to another family's patient, from the graph: the ABO_OK edge between their blood groups, the patient's antibodies (at or above $mfi) that react with an antigen the donor carries, a remembered FAILED link, the live CAN_GIVE_TO link if there is one, and, for liver, the donor's profile and the patient's weight. Antibodies are gathered before the other OPTIONAL MATCHes (aggregating them later dropped rows). Read-only. | yes |
| [`Q59_match_ease`](#q59_match_ease) | How easy each waiting family is to place in a swap: PageRank over CAN_GIVE_TO. A link points from a family whose donor can give to a family whose patient can receive, so a family's score is high when many donors can reach its patient, and those donors are themselves easy to reach. Low scores are the hardest patients to match. Read-only. | yes |

## The queries

### Q00_schema

Writes. File: [`backend/queries/Q00_schema.cypher`](../backend/queries/Q00_schema.cypher)

```cypher
// Indexes and the ABO lookup graph (statements end with a semicolon)
CREATE INDEX FOR (p:Pair) ON (p.pair_id);
CREATE INDEX FOR (p:Pair) ON (p.status);
CREATE INDEX FOR (l:Loop) ON (l.loop_id);
CREATE INDEX FOR (h:HLAAntigen) ON (h.name);
CREATE INDEX FOR (h:Hospital) ON (h.code);
CREATE INDEX FOR (e:Event) ON (e.seq);
UNWIND ['O','A','B','AB'] AS t MERGE (:BloodGroup {t: t});
UNWIND [['O','O'],['O','A'],['O','B'],['O','AB'],['A','A'],['A','AB'],['B','B'],['B','AB'],['AB','AB']] AS r
MATCH (d:BloodGroup {t: r[0]}), (p:BloodGroup {t: r[1]}) MERGE (d)-[:ABO_OK]->(p)
```

### Q01_upsert_pair

Writes. File: [`backend/queries/Q01_upsert_pair.cypher`](../backend/queries/Q01_upsert_pair.cypher)

```cypher
// Publish one de-identified pair into the exchange graph, with an optimistic version check.
// Returns nothing if the stored version differs from $expected_version (a conflict).
MERGE (p:Pair {pair_id: $pair_id})
ON CREATE SET p.version = 0
WITH p WHERE p.version = $expected_version
SET p += $pair, p.version = p.version + 1
MERGE (h:Hospital {code: $hospital.code})
ON CREATE SET h += $hospital
MERGE (p)-[:REGISTERED_AT]->(h)
MERGE (p)-[:HAS_DONOR]->(d:Donor {pair_id: $pair_id})
SET d += $donor
MERGE (p)-[:HAS_PATIENT]->(r:Patient {pair_id: $pair_id})
SET r += $patient
WITH p, d, r
MATCH (db:BloodGroup {t: $donor.abo}), (rb:BloodGroup {t: $patient.abo})
MERGE (d)-[:HAS_ABO]->(db)
MERGE (r)-[:HAS_ABO]->(rb)
WITH p, d, r
FOREACH (a IN $antigens |
  MERGE (h:HLAAntigen {name: a.name}) ON CREATE SET h.locus = a.locus
  MERGE (d)-[:HAS_ANTIGEN]->(h))
FOREACH (lv IN $liver |   // liver donors only: one LiverProfile ([] for kidney pairs)
  MERGE (d)-[:HAS_LIVER]->(x:LiverProfile {pair_id: $pair_id})
  SET x += lv)
FOREACH (ab IN $antibodies |
  MERGE (h:HLAAntigen {name: ab.name}) ON CREATE SET h.locus = ab.locus
  MERGE (x:Antibody {specificity: ab.name})
  MERGE (x)-[:REACTS_WITH]->(h)
  MERGE (r)-[k:HAS_ANTIBODY]->(x) SET k.mfi = ab.mfi)
RETURN p.pair_id AS pair_id, p.version AS version
```

### Q02_build_edges_for_pair

Writes. File: [`backend/queries/Q02_build_edges_for_pair.cypher`](../backend/queries/Q02_build_edges_for_pair.cypher)

```cypher
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
```

### Q03_virtual_crossmatch

Read-only (`GRAPH.RO_QUERY`). File: [`backend/queries/Q03_virtual_crossmatch.cypher`](../backend/queries/Q03_virtual_crossmatch.cypher)

```cypher
// Virtual crossmatch: donor antigen <- antibody <- patient, at or above the MFI threshold.
MATCH (:Pair {pair_id: $donor_pair})-[:HAS_DONOR]->(d:Donor), (:Pair {pair_id: $patient_pair})-[:HAS_PATIENT]->(r:Patient)
OPTIONAL MATCH (d)-[:HAS_ANTIGEN]->(h:HLAAntigen)<-[:REACTS_WITH]-(:Antibody)<-[k:HAS_ANTIBODY]-(r)
WHERE k.mfi >= $mfi
RETURN collect({antigen: h.name, mfi: k.mfi}) AS clashes, d.untyped_loci AS untyped_loci
```

### Q04_two_way_loops

Read-only (`GRAPH.RO_QUERY`). File: [`backend/queries/Q04_two_way_loops.cypher`](../backend/queries/Q04_two_way_loops.cypher)

```cypher
// All 2-way loops among available pairs. Both edge aliases are referenced (the graph engine
// otherwise only checks that some edge exists). id(a) < id(b) removes rotations. Both pairs must be the same organ
// (links never cross organs; this is the second guard), and $organ narrows to one program (null = every organ).
MATCH (a:Pair)-[e1:CAN_GIVE_TO]->(b:Pair)-[e2:CAN_GIVE_TO]->(a)
WHERE id(a) < id(b) AND a.status = 'waiting' AND b.status = 'waiting'
  AND a.organ = b.organ AND ($organ IS NULL OR a.organ = $organ)
  AND e1.status = 'live' AND e2.status = 'live'
  AND ($ids IS NULL OR a.pair_id IN $ids OR b.pair_id IN $ids)
RETURN [a.pair_id, b.pair_id] AS pairs, [e1.p_success, e2.p_success] AS probs
```

### Q05_three_way_loops

Read-only (`GRAPH.RO_QUERY`). File: [`backend/queries/Q05_three_way_loops.cypher`](../backend/queries/Q05_three_way_loops.cypher)

```cypher
// All 3-way loops a -> b -> c -> a, each listed once (a has the smallest id). Every pair the same organ;
// $organ narrows to one program (null = every organ).
MATCH (a:Pair)-[e1:CAN_GIVE_TO]->(b:Pair)-[e2:CAN_GIVE_TO]->(c:Pair)-[e3:CAN_GIVE_TO]->(a)
WHERE id(a) < id(b) AND id(a) < id(c) AND b <> c
  AND a.organ = b.organ AND b.organ = c.organ AND ($organ IS NULL OR a.organ = $organ)
  AND a.status = 'waiting' AND b.status = 'waiting' AND c.status = 'waiting'
  AND e1.status = 'live' AND e2.status = 'live' AND e3.status = 'live'
  AND ($ids IS NULL OR a.pair_id IN $ids OR b.pair_id IN $ids OR c.pair_id IN $ids)
RETURN [a.pair_id, b.pair_id, c.pair_id] AS pairs, [e1.p_success, e2.p_success, e3.p_success] AS probs
```

### Q06_fallbacks_inside

Read-only (`GRAPH.RO_QUERY`). File: [`backend/queries/Q06_fallbacks_inside.cypher`](../backend/queries/Q06_fallbacks_inside.cypher)

```cypher
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
```

### Q07_components

Read-only (`GRAPH.RO_QUERY`). File: [`backend/queries/Q07_components.cypher`](../backend/queries/Q07_components.cypher)

```cypher
// Weakly connected components of the compatibility graph: independent sub-problems.
CALL algo.WCC({nodeLabels: ['Pair'], relationshipTypes: ['CAN_GIVE_TO']}) YIELD node, componentId
WHERE node.status = 'waiting'
RETURN componentId AS component, collect(node.pair_id) AS pairs
```

### Q08_save_plan

Writes. File: [`backend/queries/Q08_save_plan.cypher`](../backend/queries/Q08_save_plan.cypher)

```cypher
// Write the optimiser's chosen loops as a Plan with Loop nodes (history is kept).
CREATE (pl:Plan {run_id: $run_id, at: timestamp(), policy: $policy, solve_ms: $solve_ms,
                 optimal: $optimal, expected_tx: $expected_tx, planned_tx: $planned_tx})
WITH pl
UNWIND $loops AS l
CREATE (lp:Loop {loop_id: l.loop_id, kind: l.kind, organ: l.organ, p_success: l.p_success,
                 expected_tx: l.expected_tx, status: 'selected', has_fallback: l.has_fallback, created_at: timestamp()})
CREATE (pl)-[:CONTAINS]->(lp)
WITH lp, l
UNWIND range(0, size(l.pairs) - 1) AS i
MATCH (p:Pair {pair_id: l.pairs[i]})
CREATE (p)-[:IN_LOOP {pos: i}]->(lp)
RETURN count(DISTINCT lp) AS loops
```

### Q09_offer_loop

Writes. File: [`backend/queries/Q09_offer_loop.cypher`](../backend/queries/Q09_offer_loop.cypher)

```cypher
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
```

### Q10_record_failure

Writes. File: [`backend/queries/Q10_record_failure.cypher`](../backend/queries/Q10_record_failure.cypher)

```cypher
// A link failed. Remember it as an edge, break the loop, release its pairs.
MATCH (a:Pair {pair_id: $donor_pair})-[e:CAN_GIVE_TO]->(b:Pair {pair_id: $patient_pair})
MATCH (lp:Loop {loop_id: $loop_id})
SET e.status = 'failed'
MERGE (a)-[f:FAILED]->(b)
SET f.cause = $cause, f.at = timestamp(), f.detail = $detail, f.test_id = $test_id
CREATE (fl:Failure {failure_id: $failure_id, cause: $cause, at: timestamp(), detail: $detail})
CREATE (fl)-[:BROKE]->(lp)
SET lp.status = 'broken', lp.p_success = 0.0, lp.expected_tx = 0.0, b.failed_count = coalesce(b.failed_count, 0) + 1
WITH lp, fl
// The loop can no longer happen as planned: its other pending tests are moot, so no lab spends a test on them.
OPTIONAL MATCH (moot:Crossmatch {result: 'pending'})-[:IN]->(lp)
WITH lp, fl, collect(moot) AS moot
FOREACH (x IN moot | SET x.result = 'cancelled', x.at = timestamp())
WITH lp, fl
MATCH (p:Pair)-[:IN_LOOP]->(lp)
SET p.status = 'waiting', p.version = p.version + 1
WITH lp, fl, collect(p.pair_id) AS released
OPTIONAL MATCH (x:Crossmatch {test_id: $test_id})
FOREACH (_ IN CASE WHEN x IS NULL THEN [] ELSE [1] END | CREATE (fl)-[:EVIDENCED_BY]->(x))
RETURN released
```

### Q11_local_repair_candidates

Read-only (`GRAPH.RO_QUERY`). File: [`backend/queries/Q11_local_repair_candidates.cypher`](../backend/queries/Q11_local_repair_candidates.cypher)

```cypher
// Local repair: only loops that pass through a released pair. A 3-way loop through a
// released pair stays within 2 hops of it, so the rest of the pool is untouched.
MATCH (a:Pair)-[e1:CAN_GIVE_TO]->(b:Pair)-[e2:CAN_GIVE_TO]->(c:Pair)-[e3:CAN_GIVE_TO]->(a)
WHERE a.pair_id IN $released AND id(b) <> id(c) AND a.organ = b.organ AND b.organ = c.organ
  AND a.status = 'waiting' AND b.status = 'waiting' AND c.status = 'waiting'
  AND e1.status = 'live' AND e2.status = 'live' AND e3.status = 'live'
RETURN [a.pair_id, b.pair_id, c.pair_id] AS pairs, [e1.p_success, e2.p_success, e3.p_success] AS probs
UNION
MATCH (a:Pair)-[e1:CAN_GIVE_TO]->(b:Pair)-[e2:CAN_GIVE_TO]->(a)
WHERE a.pair_id IN $released AND a.organ = b.organ AND a.status = 'waiting' AND b.status = 'waiting'
  AND e1.status = 'live' AND e2.status = 'live'
RETURN [a.pair_id, b.pair_id] AS pairs, [e1.p_success, e2.p_success] AS probs
```

### Q12_fallbacks_for

Read-only (`GRAPH.RO_QUERY`). File: [`backend/queries/Q12_fallbacks_for.cypher`](../backend/queries/Q12_fallbacks_for.cypher)

```cypher
// Stored fallbacks of a broken loop that are still usable: every link live, every pair free.
MATCH (lp:Loop {loop_id: $loop_id})<-[:FALLBACK_FOR]-(fb:Loop)
MATCH (a:Pair)-[r:IN_LOOP]->(fb)
WITH fb, a ORDER BY r.pos
WITH fb, collect(a) AS ps
MATCH (x:Pair)-[e:CAN_GIVE_TO]->(y:Pair)
WHERE x IN ps AND y IN ps
WITH fb, ps, collect(e) AS es
WHERE size(es) = size(ps) AND all(e IN es WHERE e.status = 'live') AND all(p IN ps WHERE p.status = 'waiting')
WITH fb, ps, reduce(x = 1.0, e IN es | x * e.p_success) AS p
RETURN fb.loop_id AS loop_id, [q IN ps | q.pair_id] AS pairs, round(p * 100) / 100.0 AS p_success,
       round(size(ps) * p * 100) / 100.0 AS expected_tx
```

### Q13_explain_loop

Read-only (`GRAPH.RO_QUERY`). File: [`backend/queries/Q13_explain_loop.cypher`](../backend/queries/Q13_explain_loop.cypher)

```cypher
// Explain a loop link by link. Every reason is read from the edge, not written by AI.
MATCH (p:Pair)-[r:IN_LOOP]->(lp:Loop {loop_id: $loop_id})
WITH lp, p ORDER BY r.pos
WITH lp, collect(p) AS ps
UNWIND range(0, size(ps) - 1) AS i
WITH lp, ps[i] AS a, ps[(i + 1) % size(ps)] AS b, i
MATCH (a)-[e:CAN_GIVE_TO]->(b)
MATCH (a)-[:REGISTERED_AT]->(ha:Hospital), (b)-[:REGISTERED_AT]->(hb:Hospital)
MATCH (a)-[:HAS_DONOR]->(d:Donor), (b)-[:HAS_PATIENT]->(r:Patient)
OPTIONAL MATCH (a)-[f:FAILED]->(b)
RETURN i AS pos, a.pair_id AS from_pair, b.pair_id AS to_pair, ha.city AS from_city, hb.city AS to_city, lp.organ AS organ,
       d.abo AS donor_abo, d.relation AS donor_relation, r.abo AS patient_abo,
       e.reasons AS reasons, e.p_success AS p_success, e.vxm AS vxm, e.status AS status,
       e.lobe AS lobe, e.grwr AS grwr, e.remnant_pct AS remnant_pct,
       f.cause AS failed_cause, f.detail AS failed_detail
ORDER BY pos
```

### Q14_decision_trail

Read-only (`GRAPH.RO_QUERY`). File: [`backend/queries/Q14_decision_trail.cypher`](../backend/queries/Q14_decision_trail.cypher)

```cypher
// Decision memory: what was decided, by whom, approved by whom, based on which facts.
MATCH (dc:Decision)-[:BASED_ON]->(x)
WHERE (x:Loop AND x.loop_id IN $loop_ids) OR (x:Failure AND x.failure_id IN $failure_ids) OR dc.pair_id IN $pair_ids
OPTIONAL MATCH (dc)-[:MADE_BY]->(ag:Agent)
OPTIONAL MATCH (dc)-[:APPROVED_BY]->(hu:Agent)
RETURN DISTINCT dc.decision_id AS id, dc.action AS action, dc.rationale AS rationale, dc.at AS at,
       ag.name AS made_by, hu.name AS approved_by, dc.read AS read
ORDER BY at DESC
```

### Q15_loop_committee_readiness

Read-only (`GRAPH.RO_QUERY`). File: [`backend/queries/Q15_loop_committee_readiness.cypher`](../backend/queries/Q15_loop_committee_readiness.cypher)

```cypher
// Exchange side of committee readiness: approval state and due date per pair in a loop.
// Document detail comes from each hospital's private graph (Q15b).
MATCH (p:Pair)-[r:IN_LOOP]->(:Loop {loop_id: $loop_id})
MATCH (p)-[:REGISTERED_AT]->(h:Hospital)
RETURN p.pair_id AS pair_id, h.code AS hospital, h.city AS city, p.approval_state AS approval_state,
       p.approval_opened AS opened, p.approval_due AS due
ORDER BY r.pos
```

### Q15b_documents

Read-only (`GRAPH.RO_QUERY`). File: [`backend/queries/Q15b_documents.cypher`](../backend/queries/Q15b_documents.cypher)

```cypher
// Hospital graph: documents for one pair (private; never copied to the exchange).
MATCH (:Pair {pair_id: $pair_id})-[:NEEDS_DOC]->(d:Document)
RETURN d.type AS type, d.status AS status ORDER BY type
```

### Q16_family_status

Read-only (`GRAPH.RO_QUERY`). File: [`backend/queries/Q16_family_status.cypher`](../backend/queries/Q16_family_status.cypher)

```cypher
// One family's own case. Returns only this pair's facts, never another family's.
// Pattern comprehensions anchored at p, so nothing is matched against a null loop.
MATCH (p:Pair {pair_id: $pair_id})-[:REGISTERED_AT]->(h:Hospital)
MATCH (p)-[:HAS_DONOR]->(d:Donor)
WITH p, h, d, ['selected', 'offered', 'testing', 'committee', 'locked'] AS active
WITH p, h, d, active,
     head([(p)-[:IN_LOOP]->(l:Loop) WHERE l.status IN active | l]) AS lp,
     [(p)-[:IN_LOOP]->(l:Loop)<-[:IN_LOOP]-(q:Pair) WHERE l.status IN active AND q <> p | q.pair_id] AS others,
     [(p)<-[:PATIENT_OF]-(x:Crossmatch)-[:IN]->(l:Loop) WHERE l.status IN active | x.result] AS own_tests
RETURN p.pair_id AS pair_id, p.organ AS organ, h.city AS city, p.entered_at AS registered, d.relation AS donor_relation,
       p.status AS status, coalesce(p.failed_count, 0) AS failed_count, p.approval_state AS approval_state, p.approval_due AS approval_due,
       lp.loop_id AS loop_id, lp.kind AS loop_kind, lp.status AS loop_status, lp.created_at AS matched_at,
       CASE WHEN lp IS NULL THEN 0 ELSE size(others) + 1 END AS families, own_tests
```

### Q17_failure_priors

Writes. File: [`backend/queries/Q17_failure_priors.cypher`](../backend/queries/Q17_failure_priors.cypher)

```cypher
// Episodic -> semantic memory: positive tests from a lab on DQ-untyped donors lower
// the success estimate for that lab's future DQ-untyped links.
MATCH (h:Hospital {lab: $lab})<-[:REGISTERED_AT]-(a:Pair)-[f:FAILED {cause: 'positive_xm'}]->()
WITH h, count(f) AS fails
MATCH (h)<-[:REGISTERED_AT]-(a:Pair)-[:HAS_DONOR]->(d:Donor)
WHERE size(d.untyped_loci) > 0
SET a.lab_prior = CASE WHEN 1.0 - 0.05 * fails < 0.7 THEN 0.7 ELSE 1.0 - 0.05 * fails END
RETURN fails, count(a) AS pairs_adjusted
```

### Q18_events_since

Read-only (`GRAPH.RO_QUERY`). File: [`backend/queries/Q18_events_since.cypher`](../backend/queries/Q18_events_since.cypher)

```cypher
// The "What the agents are doing" feed.
MATCH (e:Event) WHERE e.seq > $since
RETURN e.seq AS seq, e.at AS at, e.agent AS agent, e.text AS text, e.kind AS kind
ORDER BY e.seq LIMIT 200
```

### Q19_bridge_pairs

Read-only (`GRAPH.RO_QUERY`). File: [`backend/queries/Q19_bridge_pairs.cypher`](../backend/queries/Q19_bridge_pairs.cypher)

```cypher
// Pairs whose withdrawal would break the most loops (betweenness centrality).
CALL algo.betweenness({nodeLabels: ['Pair'], relationshipTypes: ['CAN_GIVE_TO']}) YIELD node, score
WHERE node.status = 'waiting'
RETURN node.pair_id AS pair_id, score ORDER BY score DESC LIMIT $limit
```

### Q20_pool_summary

Read-only (`GRAPH.RO_QUERY`). File: [`backend/queries/Q20_pool_summary.cypher`](../backend/queries/Q20_pool_summary.cypher)

```cypher
// Stat tiles for the live pool, overall and per organ.
MATCH (p:Pair)
OPTIONAL MATCH (p)-[:HAS_PATIENT]->(r:Patient)
RETURN count(p) AS pairs,
       sum(CASE WHEN p.status = 'waiting' THEN 1 ELSE 0 END) AS waiting,
       sum(CASE WHEN r.abo = 'O' AND p.status = 'waiting' THEN 1 ELSE 0 END) AS o_waiting,
       sum(CASE WHEN r.cpra > 85 THEN 1 ELSE 0 END) AS highly_sensitised,
       sum(CASE WHEN p.organ = 'kidney' THEN 1 ELSE 0 END) AS kidney_pairs,
       sum(CASE WHEN p.organ = 'liver' THEN 1 ELSE 0 END) AS liver_pairs,
       sum(CASE WHEN p.organ = 'liver' AND p.status = 'waiting' THEN 1 ELSE 0 END) AS liver_waiting,
       sum(CASE WHEN p.organ = 'liver' AND r.meld >= $urgent_meld THEN 1 ELSE 0 END) AS liver_urgent
```

### Q21_liver_edges_for_pair

Writes. File: [`backend/queries/Q21_liver_edges_for_pair.cypher`](../backend/queries/Q21_liver_edges_for_pair.cypher)

```cypher
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
```

### Q24_loop_links

Read-only (`GRAPH.RO_QUERY`). File: [`backend/queries/Q24_loop_links.cypher`](../backend/queries/Q24_loop_links.cypher)

```cypher
// Every donation link of the given loops, in order, with the facts the map shows when a link is
// clicked: chance it holds, its reasons, and any failure remembered on it.
MATCH (p:Pair)-[r:IN_LOOP]->(l:Loop) WHERE l.loop_id IN $loop_ids
WITH l, p ORDER BY r.pos
WITH l, collect(p) AS ps
UNWIND range(0, size(ps) - 1) AS i
WITH l, ps[i] AS a, ps[(i + 1) % size(ps)] AS b, i
MATCH (a)-[:HAS_DONOR]->(d:Donor), (b)-[:HAS_PATIENT]->(t:Patient)
OPTIONAL MATCH (a)-[e:CAN_GIVE_TO]->(b)
OPTIONAL MATCH (a)-[f:FAILED]->(b)
RETURN l.loop_id AS loop_id, l.organ AS organ, i AS pos, a.pair_id AS from_pair, b.pair_id AS to_pair,
       d.abo AS donor_abo, d.relation AS donor_relation, t.abo AS patient_abo, t.cpra AS patient_cpra,
       t.meld AS patient_meld, t.weight_kg AS patient_weight_kg, e.lobe AS lobe, e.grwr AS grwr,
       e.p_success AS p_success, coalesce(e.status, 'failed') AS status, e.reasons AS reasons,
       f.cause AS failed_cause, f.detail AS failed_detail
ORDER BY loop_id, pos
```

### Q25_program_pairs

Read-only (`GRAPH.RO_QUERY`). File: [`backend/queries/Q25_program_pairs.cypher`](../backend/queries/Q25_program_pairs.cypher)

```cypher
// Shared exchange facts for every pair in one program ($organ = 'kidney' or 'liver'; null = every program), for the
// pool table and the program APIs. De-identified: names, documents and clinical notes stay in hosp_<city>.
// Kidney facts: cPRA, untyped loci, crossmatch results. Liver facts: MELD, weight, volumetry and evaluation statuses.
MATCH (p:Pair)-[:REGISTERED_AT]->(h:Hospital)
WHERE ($organ IS NULL OR p.organ = $organ) AND ($ids IS NULL OR p.pair_id IN $ids)
WITH p, h
MATCH (p)-[:HAS_DONOR]->(d:Donor), (p)-[:HAS_PATIENT]->(r:Patient)
OPTIONAL MATCH (d)-[:HAS_LIVER]->(lv:LiverProfile)
OPTIONAL MATCH (p)-[:IN_LOOP]->(l:Loop) WHERE l.status IN $active
WITH p, h, d, r, lv, head(collect(l.loop_id)) AS loop_id
// Live link counts come from Q31_pair_link_counts: FalkorDB mis-counted them when chained here.
OPTIONAL MATCH (x:Crossmatch)-[:PATIENT_OF]->(p)
WITH p, h, d, r, lv, loop_id, collect(x.result) AS tests
RETURN p.pair_id AS pair_id, p.organ AS organ, h.code AS code, h.city AS city, p.status AS status,
       p.approval_state AS approval_state, coalesce(p.failed_count, 0) AS failed_count,
       d.abo AS donor_abo, d.relation AS donor_relation, r.abo AS patient_abo,
       r.cpra AS cpra, d.untyped_loci AS untyped_loci,
       r.meld AS meld, r.weight_kg AS patient_weight_kg,
       lv.volumetry AS volumetry, lv.anatomy_review AS anatomy_review, lv.donor_evaluation AS donor_evaluation,
       r.recipient_evaluation AS recipient_evaluation, r.surgical_review AS surgical_review,
       loop_id, tests
ORDER BY pair_id
```

### Q26_loop_evidence

Read-only (`GRAPH.RO_QUERY`). File: [`backend/queries/Q26_loop_evidence.cypher`](../backend/queries/Q26_loop_evidence.cypher)

```cypher
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
```

### Q27_integrity_shared

Read-only (`GRAPH.RO_QUERY`). File: [`backend/queries/Q27_integrity_shared.cypher`](../backend/queries/Q27_integrity_shared.cypher)

```cypher
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
```

### Q28_integrity_kidney

Read-only (`GRAPH.RO_QUERY`). File: [`backend/queries/Q28_integrity_kidney.cypher`](../backend/queries/Q28_integrity_kidney.cypher)

```cypher
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
```

### Q29_integrity_liver

Read-only (`GRAPH.RO_QUERY`). File: [`backend/queries/Q29_integrity_liver.cypher`](../backend/queries/Q29_integrity_liver.cypher)

```cypher
// Liver program completeness checks: liver profile, graft-size confirmation, and the evaluation and review statuses
// of families in loops in play. Workflow checks only; statuses are program configuration, not diagnoses.
// (A WITH follows each filtered MATCH: in FalkorDB a MATCH straight after a WHERE can drop that filter.)
MATCH (p:Pair {organ: 'liver'})-[:HAS_DONOR]->(d:Donor) WHERE NOT (d)-[:HAS_LIVER]->(:LiverProfile)
RETURN 'missing_liver_profile' AS check, 'error' AS severity, p.pair_id AS ref, 'liver' AS organ,
       'Liver donor has no liver profile in the shared pool' AS detail
UNION
MATCH (l:Loop {organ: 'liver'}) WHERE l.status IN ['committee', 'locked']
WITH l
MATCH (p:Pair)-[:IN_LOOP]->(l), (p)-[:HAS_DONOR]->(:Donor)-[:HAS_LIVER]->(lv:LiverProfile)
WITH l, p, lv WHERE coalesce(lv.volumetry, 'estimate') <> 'ct'
RETURN 'graft_suitability_unconfirmed' AS check, 'error' AS severity, l.loop_id AS ref, 'liver' AS organ,
       p.pair_id + ': graft size is still a height-and-weight estimate at committee stage' AS detail
UNION
MATCH (l:Loop {organ: 'liver'}) WHERE l.status IN ['offered', 'testing', 'committee', 'locked']
WITH l
MATCH (p:Pair)-[:IN_LOOP]->(l), (p)-[:HAS_DONOR]->(:Donor)-[:HAS_LIVER]->(lv:LiverProfile)
WITH l, p, lv WHERE coalesce(lv.anatomy_review, 'UNKNOWN') <> 'ELIGIBLE' OR coalesce(lv.donor_evaluation, 'UNKNOWN') <> 'ELIGIBLE'
RETURN 'donor_review_open' AS check, 'warn' AS severity, l.loop_id AS ref, 'liver' AS organ,
       p.pair_id + ': anatomical review ' + coalesce(lv.anatomy_review, 'UNKNOWN') + ', donor evaluation ' + coalesce(lv.donor_evaluation, 'UNKNOWN') AS detail
UNION
MATCH (l:Loop {organ: 'liver'}) WHERE l.status IN ['offered', 'testing', 'committee', 'locked']
WITH l
MATCH (p:Pair)-[:IN_LOOP]->(l), (p)-[:HAS_PATIENT]->(r:Patient)
WITH l, p, r WHERE coalesce(r.recipient_evaluation, 'UNKNOWN') <> 'ELIGIBLE' OR coalesce(r.surgical_review, 'UNKNOWN') <> 'ELIGIBLE'
RETURN 'recipient_review_open' AS check, 'warn' AS severity, l.loop_id AS ref, 'liver' AS organ,
       p.pair_id + ': recipient evaluation ' + coalesce(r.recipient_evaluation, 'UNKNOWN') + ', surgical suitability review ' + coalesce(r.surgical_review, 'UNKNOWN') AS detail
```

### Q30_exchange_candidates

Read-only (`GRAPH.RO_QUERY`). File: [`backend/queries/Q30_exchange_candidates.cypher`](../backend/queries/Q30_exchange_candidates.cypher)

```cypher
// Possible donations to and from one pair inside its own program: the live CAN_GIVE_TO edges with their reasons.
// $organ is required and must equal the pair's organ, so a caller can never read across programs.
MATCH (p:Pair {pair_id: $pair_id}) WHERE p.organ = $organ
OPTIONAL MATCH (p)-[o:CAN_GIVE_TO {status: 'live'}]->(t:Pair) WHERE t.organ = $organ
WITH p, collect(CASE WHEN t IS NULL THEN null ELSE {to_pair: t.pair_id, p_success: o.p_success, reasons: o.reasons} END) AS gives
OPTIONAL MATCH (s:Pair)-[i:CAN_GIVE_TO {status: 'live'}]->(p) WHERE s.organ = $organ
RETURN p.pair_id AS pair_id, p.organ AS organ, gives,
       collect(CASE WHEN s IS NULL THEN null ELSE {from_pair: s.pair_id, p_success: i.p_success, reasons: i.reasons} END) AS receives
```

### Q31_pair_link_counts

Read-only (`GRAPH.RO_QUERY`). File: [`backend/queries/Q31_pair_link_counts.cypher`](../backend/queries/Q31_pair_link_counts.cypher)

```cypher
// Live CAN_GIVE_TO links per pair, in each direction, inside one program ($organ; null = every program):
// how many patients a pair's donor could give to, and how many donors could give to its patient.
MATCH (p:Pair)-[o:CAN_GIVE_TO]->(t:Pair)
WHERE o.status = 'live' AND ($organ IS NULL OR p.organ = $organ)
RETURN p.pair_id AS pair_id, 'gives_to' AS dir, count(DISTINCT t) AS n
UNION
MATCH (s:Pair)-[i:CAN_GIVE_TO]->(p:Pair)
WHERE i.status = 'live' AND ($organ IS NULL OR p.organ = $organ)
RETURN p.pair_id AS pair_id, 'receives_from' AS dir, count(DISTINCT s) AS n
```

### Q32_withdrawal_impact

Read-only (`GRAPH.RO_QUERY`). File: [`backend/queries/Q32_withdrawal_impact.cypher`](../backend/queries/Q32_withdrawal_impact.cypher)

```cypher
// What breaks if a family withdraws: every live loop it belongs to, the other families in that loop, and whether the
// loop's stored 2-way fallback survives without it. Read-only.
MATCH (p:Pair {pair_id: $pair_id})-[:IN_LOOP]->(l:Loop)
WHERE l.status IN ['selected', 'offered', 'testing', 'committee', 'locked']
MATCH (o:Pair)-[r:IN_LOOP]->(l)
WITH p, l, o ORDER BY r.pos
WITH p, l, collect(o.pair_id) AS families
OPTIONAL MATCH (fb:Loop)-[:FALLBACK_FOR]->(l)
OPTIONAL MATCH (q:Pair)-[:IN_LOOP]->(fb)
WITH p, l, families, fb, collect(q.pair_id) AS fallback_pairs
RETURN l.loop_id AS loop_id, l.organ AS organ, l.kind AS kind, l.status AS status, families,
       l.expected_tx AS expected_tx, fb.loop_id AS fallback, fallback_pairs,
       fb IS NOT NULL AND NOT p.pair_id IN fallback_pairs AS fallback_survives
```

### Q33_reachable_within

Read-only (`GRAPH.RO_QUERY`). File: [`backend/queries/Q33_reachable_within.cypher`](../backend/queries/Q33_reachable_within.cypher)

```cypher
// Multi-hop reach: which waiting families of the same program a family's donor can reach in at most $hops donations
// (1 to 3) over live links, with the shortest route found to each. Depth is a parameter, so the same question can be
// asked at depth 1 and depth 3. FalkorDB doesn't take a parameter as a path bound, hence *1..3 plus the length filter.
MATCH (a:Pair {pair_id: $pair_id})
MATCH path = (a)-[:CAN_GIVE_TO*1..3]->(b:Pair)
WHERE length(path) <= $hops AND b <> a AND b.status = 'waiting' AND b.organ = a.organ
  AND all(e IN relationships(path) WHERE e.status = 'live')
WITH b, min(length(path)) AS hops, collect(path) AS paths
WITH b, hops, [x IN paths WHERE length(x) = hops][0] AS route
RETURN b.pair_id AS pair_id, hops, [n IN nodes(route) | n.pair_id] AS route
ORDER BY hops, pair_id
LIMIT $limit
```

### Q34_connection_path

Read-only (`GRAPH.RO_QUERY`). File: [`backend/queries/Q34_connection_path.cypher`](../backend/queries/Q34_connection_path.cypher)

```cypher
// How two families of the same program are connected: the shortest chain of compatibility links from one family's
// donor to the other family's patient (any link status; the caller reports failed links on the route). Read-only.
MATCH (a:Pair {pair_id: $from_pair}), (b:Pair {pair_id: $to_pair})
WHERE a.organ = b.organ
RETURN [n IN nodes(shortestPath((a)-[:CAN_GIVE_TO*1..6]->(b))) | n.pair_id] AS route
```

### Q35_failure_memory

Read-only (`GRAPH.RO_QUERY`). File: [`backend/queries/Q35_failure_memory.cypher`](../backend/queries/Q35_failure_memory.cypher)

```cypher
// Failure memory around one family: every link the graph remembers as failed where the family is the donor side or
// the patient side, with the test that proved it. These links are never proposed again. Read-only.
MATCH (a:Pair)-[f:FAILED]->(b:Pair)
WHERE a.pair_id = $pair_id OR b.pair_id = $pair_id
OPTIONAL MATCH (fl:Failure)-[:EVIDENCED_BY]->(x:Crossmatch {test_id: f.test_id})
RETURN a.pair_id AS donor_pair, b.pair_id AS patient_pair, f.cause AS cause, f.detail AS detail, f.at AS at,
       f.test_id AS test_id, fl.failure_id AS failure_id
ORDER BY at DESC
```

### Q36_resolve_ids

Read-only (`GRAPH.RO_QUERY`). File: [`backend/queries/Q36_resolve_ids.cypher`](../backend/queries/Q36_resolve_ids.cypher)

```cypher
// Resolve ids against the graph before anything reasons about them: is each id a pair or a loop, which program is it
// in, and which hospitals does it involve (for access checks). An id that matches nothing comes back with kind null.
UNWIND $ids AS id
OPTIONAL MATCH (p:Pair {pair_id: id})-[:REGISTERED_AT]->(h:Hospital)
OPTIONAL MATCH (l:Loop {loop_id: id})
OPTIONAL MATCH (q:Pair)-[:IN_LOOP]->(l)
OPTIONAL MATCH (q)-[:REGISTERED_AT]->(hq:Hospital)
WITH id, p, h, l, collect(DISTINCT hq.code) AS loop_hospitals
RETURN id,
       CASE WHEN p IS NOT NULL THEN 'pair' WHEN l IS NOT NULL THEN 'loop' ELSE null END AS kind,
       coalesce(p.organ, l.organ) AS organ, p.status AS pair_status, l.status AS loop_status,
       CASE WHEN p IS NOT NULL THEN [h.code] ELSE loop_hospitals END AS hospitals
```

### Q37_remember_answer

Writes. File: [`backend/queries/Q37_remember_answer.cypher`](../backend/queries/Q37_remember_answer.cypher)

```cypher
// Agent memory: store a verified Ask KindRed answer as a Question node linked (ABOUT) to every pair and loop it
// verified, with the hospital/program scope it touches, so a later session can recall it with its date.
CREATE (q:Question {question_id: $question_id, text: $text, answer: $answer, at: timestamp(), asked_by: $asked_by,
                    tools: $tools, scope: $scope})
WITH q
OPTIONAL MATCH (p:Pair) WHERE p.pair_id IN $ids
WITH q, collect(p) AS ps
FOREACH (x IN ps | CREATE (q)-[:ABOUT]->(x))
WITH q
OPTIONAL MATCH (l:Loop) WHERE l.loop_id IN $ids
WITH q, collect(l) AS ls
FOREACH (x IN ls | CREATE (q)-[:ABOUT]->(x))
RETURN q.question_id AS question_id
```

### Q38_recall

Read-only (`GRAPH.RO_QUERY`). File: [`backend/queries/Q38_recall.cypher`](../backend/queries/Q38_recall.cypher)

```cypher
// Agent memory, read side: earlier answered questions about any of these pairs or loops, newest first, with when
// they were learned and the scope they touch (the caller hides any the viewer may not see). Read-only.
MATCH (q:Question)-[:ABOUT]->(x)
WHERE (x:Pair AND x.pair_id IN $ids) OR (x:Loop AND x.loop_id IN $ids)
WITH DISTINCT q
RETURN q.question_id AS question_id, q.text AS question, q.answer AS answer, q.at AS at, q.asked_by AS asked_by,
       q.tools AS tools, q.scope AS scope
ORDER BY at DESC
LIMIT $limit
```

### Q39_recent_questions

Read-only (`GRAPH.RO_QUERY`). File: [`backend/queries/Q39_recent_questions.cypher`](../backend/queries/Q39_recent_questions.cypher)

```cypher
// Agent memory across sessions: the most recent answered questions, for the Ask screen's history. Read-only.
MATCH (q:Question)
OPTIONAL MATCH (q)-[:ABOUT]->(x)
WITH q, collect(coalesce(x.pair_id, x.loop_id)) AS about
RETURN q.question_id AS question_id, q.text AS question, q.answer AS answer, q.at AS at, q.asked_by AS asked_by,
       q.scope AS scope, about
ORDER BY at DESC
LIMIT $limit
```

### Q40_persona_readings

Read-only (`GRAPH.RO_QUERY`). File: [`backend/queries/Q40_persona_readings.cypher`](../backend/queries/Q40_persona_readings.cypher)

```cypher
// Demo patients, hospital graph: one patient's readings of one measure (eGFR or MELD), oldest first. The clinical
// history stays in the hospital's private graph; the shared exchange never sees it. Read-only.
MATCH (p:Pair {pair_id: $pair_id})-[:HAS_RESULT]->(r:LabResult {kind: $kind})
RETURN r.result_id AS result_id, r.value AS value, r.unit AS unit, r.at AS at, r.week AS week,
       coalesce(r.assessed, false) AS assessed
ORDER BY r.at
```

### Q41_record_reading

Writes. File: [`backend/queries/Q41_record_reading.cypher`](../backend/queries/Q41_record_reading.cypher)

```cypher
// Demo patients, hospital graph: a new lab reading arrives for a patient (one simulated week later).
// It starts unassessed; the health watch marks it assessed once it has compared it with what it remembers.
MATCH (p:Pair {pair_id: $pair_id})
CREATE (p)-[:HAS_RESULT]->(r:LabResult {result_id: $result_id, kind: $kind, value: $value, unit: $unit, at: $at,
                                         week: $week, source: $source, assessed: false})
RETURN r.result_id AS result_id
```

### Q42_current_facts

Read-only (`GRAPH.RO_QUERY`). File: [`backend/queries/Q42_current_facts.cypher`](../backend/queries/Q42_current_facts.cypher)

```cypher
// Agent memory, semantic, persona graph: what the agents currently believe about this person. Each fact keeps the
// one it replaced (SUPERSEDES), so the answer carries what changed and when. Read-only.
MATCH (:Person {persona_id: $persona_id})-[:KNOWS]->(f:Fact)
WHERE f.current = true
OPTIONAL MATCH (f)-[:SUPERSEDES]->(old:Fact)
RETURN f.key AS key, f.value AS value, f.text AS text, f.at AS at, old.value AS was, old.text AS was_text, old.at AS was_at
ORDER BY key
```

### Q43_findings

Read-only (`GRAPH.RO_QUERY`). File: [`backend/queries/Q43_findings.cypher`](../backend/queries/Q43_findings.cypher)

```cypher
// Agent memory, episodic, persona graph: what the health watch noticed, newest first, with the readings each
// finding rests on (BASED_ON) and the hand-offs it started. Read-only.
MATCH (:Person {persona_id: $persona_id})-[:HAS_FINDING]->(f:Finding)
OPTIONAL MATCH (f)-[:BASED_ON]->(r:Reading)
OPTIONAL MATCH (f)-[:HANDED_OFF]->(h:Handoff)
WITH f, collect(DISTINCT {result_id: r.result_id, value: r.value, at: r.at}) AS readings,
     collect(DISTINCT {task_id: h.task_id, agent: h.agent, action: h.action, status: h.status, detail: h.detail}) AS handoffs
RETURN f.finding_id AS finding_id, f.at AS at, f.week AS week, f.stage AS stage, f.previous_stage AS previous_stage,
       f.text AS text, f.value AS value, f.slope_per_year AS slope_per_year, f.weeks_to_next AS weeks_to_next,
       f.kind AS kind, f.trace AS trace, f.model AS model, f.safety_net AS safety_net, f.action AS action, f.due AS due,
       f.read AS read, readings, handoffs
ORDER BY at DESC
LIMIT $limit
```

### Q44_playbook

Read-only (`GRAPH.RO_QUERY`). File: [`backend/queries/Q44_playbook.cypher`](../backend/queries/Q44_playbook.cypher)

```cypher
// Agent memory, procedural, persona graph: the steps the agents follow when this person enters a stage, in order.
// The health watch reads its own playbook from the graph instead of hard-coding it. Read-only.
MATCH (:Person {persona_id: $persona_id})-[:FOLLOWS]->(pb:Playbook {stage: $stage})-[s:STEP]->(st:Step)
RETURN pb.stage AS stage, s.order AS step, st.agent AS agent, st.action AS action, st.what AS what,
       st.in_days AS in_days, st.why AS why
ORDER BY step
```

### Q45_remember_finding

Writes. File: [`backend/queries/Q45_remember_finding.cypher`](../backend/queries/Q45_remember_finding.cypher)

```cypher
// Agent memory, persona graph: store what the health watch noticed, linked to the readings it used (mirrored from
// the hospital graph by id) and to the playbook it triggered, if the stage changed.
MATCH (me:Person {persona_id: $persona_id})
CREATE (me)-[:HAS_FINDING]->(f:Finding {finding_id: $finding_id, at: $at, week: $week, kind: $kind, stage: $stage,
                                         previous_stage: $previous_stage, text: $text, value: $value,
                                         slope_per_year: $slope_per_year, weeks_to_next: $weeks_to_next})
WITH me, f
UNWIND $readings AS rd
MERGE (r:Reading {result_id: rd.result_id}) SET r.value = rd.value, r.at = rd.at
CREATE (f)-[:BASED_ON]->(r)
WITH DISTINCT me, f
OPTIONAL MATCH (me)-[:FOLLOWS]->(pb:Playbook {stage: $triggered})
FOREACH (x IN CASE WHEN pb IS NULL THEN [] ELSE [pb] END | CREATE (f)-[:TRIGGERED]->(x))
RETURN f.finding_id AS finding_id
```

### Q46_update_fact

Writes. File: [`backend/queries/Q46_update_fact.cypher`](../backend/queries/Q46_update_fact.cypher)

```cypher
// Agent memory, semantic, persona graph: replace what the agents believe about one thing (stage, trend, projection,
// pool options). The old fact stays, marked not current, behind a SUPERSEDES edge, so beliefs have a history.
MATCH (me:Person {persona_id: $persona_id})
OPTIONAL MATCH (me)-[:KNOWS]->(old:Fact {key: $key, current: true})
WITH me, old
WHERE old IS NULL OR old.value <> $value
CREATE (me)-[:KNOWS]->(f:Fact {fact_id: $fact_id, key: $key, value: $value, text: $text, at: $at, current: true})
FOREACH (x IN CASE WHEN old IS NULL THEN [] ELSE [old] END | SET x.current = false CREATE (f)-[:SUPERSEDES]->(x))
RETURN f.fact_id AS fact_id
```

### Q47_sessions

Read-only (`GRAPH.RO_QUERY`). File: [`backend/queries/Q47_sessions.cypher`](../backend/queries/Q47_sessions.cypher)

```cypher
// Agent memory, persona graph: earlier visits to this person's page, newest first, so a new session can say what
// changed since the last one. Read-only.
MATCH (:Person {persona_id: $persona_id})-[:HAD_SESSION]->(s:Session)
RETURN s.session_id AS session_id, s.at AS at, s.week AS week, s.greeting AS greeting
ORDER BY at DESC
LIMIT $limit
```

### Q48_pair_handoffs

Read-only (`GRAPH.RO_QUERY`). File: [`backend/queries/Q48_pair_handoffs.cypher`](../backend/queries/Q48_pair_handoffs.cypher)

```cypher
// Exchange graph: the hand-offs about one pair (Task nodes ASSIGNED_TO an agent and ABOUT the pair), newest
// first. This is the shared state agents coordinate through, so a restart loses nothing. Read-only.
MATCH (t:Task)-[:ABOUT]->(:Pair {pair_id: $pair_id})
OPTIONAL MATCH (t)-[:ASSIGNED_TO]->(a:Agent)
RETURN t.task_id AS task_id, t.kind AS kind, t.status AS status, a.name AS agent, t.action AS action,
       t.payload AS payload, t.result AS result, t.created_at AS at, t.done_at AS done_at, t.finding_id AS finding_id,
       t.read AS read
ORDER BY at DESC, task_id
```

### Q49_appointments

Read-only (`GRAPH.RO_QUERY`). File: [`backend/queries/Q49_appointments.cypher`](../backend/queries/Q49_appointments.cypher)

```cypher
// Demo patients, hospital graph: one patient's appointments (past visits, and tentative ones the scheduler held),
// by date. Read-only.
MATCH (:Pair {pair_id: $pair_id})-[:HAS_APPOINTMENT]->(a:Appointment)
RETURN a.appointment_id AS appointment_id, a.kind AS kind, a.status AS status, a.at AS at, a.note AS note,
       a.booked_by AS booked_by, a.task_id AS task_id
ORDER BY at
```

### Q50_record_search

Writes. File: [`backend/queries/Q50_record_search.cypher`](../backend/queries/Q50_record_search.cypher)

```cypher
// Agent memory, persona graph: one swap search the agents ran for this patient, at one depth (2 = 2-way only,
// 3 = 2-way and 3-way), with how many loops it found and the best ones. Kept so a shallow search can be compared with
// a deeper one, week by week.
MATCH (me:Person {persona_id: $persona_id})
CREATE (me)-[:SEARCHED]->(s:Search {search_id: $search_id, at: $at, week: $week, depth: $depth, found: $found,
                                    total: $total, loops: $loops, by: $by, created: timestamp()})
RETURN s.search_id AS search_id
```

### Q51_searches

Read-only (`GRAPH.RO_QUERY`). File: [`backend/queries/Q51_searches.cypher`](../backend/queries/Q51_searches.cypher)

```cypher
// Agent memory, persona graph: every swap search for this patient, newest first. Read-only.
MATCH (:Person {persona_id: $persona_id})-[:SEARCHED]->(s:Search)
RETURN s.search_id AS search_id, s.at AS at, s.week AS week, s.depth AS depth, s.found AS found, s.total AS total,
       s.loops AS loops, s.by AS by
ORDER BY s.created DESC
LIMIT $limit
```

### Q52_conversation

Read-only (`GRAPH.RO_QUERY`). File: [`backend/queries/Q52_conversation.cypher`](../backend/queries/Q52_conversation.cypher)

```cypher
// Agent memory, persona graph: the ongoing conversation about this patient (Ask KindRed on the patient's page), in
// order. Stored in the graph, so any browser sees the same history. Read-only.
MATCH (:Person {persona_id: $persona_id})-[:SAID]->(m:Message)
RETURN m.message_id AS message_id, m.role AS role, m.text AS text, m.at AS at, m.tools AS tools, m.model AS model, m.memory AS memory
ORDER BY m.at
```

### Q53_add_message

Writes. File: [`backend/queries/Q53_add_message.cypher`](../backend/queries/Q53_add_message.cypher)

```cypher
// Agent memory, persona graph: one turn of the conversation about this patient, from the person or from Ask KindRed.
// `memory` is JSON: what the answer read from memory, with when each piece was learned (shown next to the answer).
MATCH (me:Person {persona_id: $persona_id})
CREATE (me)-[:SAID]->(m:Message {message_id: $message_id, role: $role, text: $text, at: $at, tools: $tools, model: $model,
                           memory: $memory})
RETURN m.message_id AS message_id
```

### Q54_failure_memory_around

Read-only (`GRAPH.RO_QUERY`). File: [`backend/queries/Q54_failure_memory_around.cypher`](../backend/queries/Q54_failure_memory_around.cypher)

```cypher
// Failure memory the matching agent reads before it searches: every link the graph remembers as FAILED, only around
// $ids when given (null = the whole pool). Searches only walk live CAN_GIVE_TO links, so these are never proposed
// again, and a family whose earlier test failed gets a priority bonus. Read-only.
MATCH (a:Pair)-[f:FAILED]->(b:Pair)
WHERE $ids IS NULL OR a.pair_id IN $ids OR b.pair_id IN $ids
RETURN a.pair_id AS donor_pair, b.pair_id AS patient_pair, f.cause AS cause, f.at AS at, f.test_id AS test_id
ORDER BY at DESC
```

### Q55_family_parts

Read-only (`GRAPH.RO_QUERY`). File: [`backend/queries/Q55_family_parts.cypher`](../backend/queries/Q55_family_parts.cypher)

```cypher
// A family broken into its parts, for the explorer: the patient and the donor, the patient's antibodies (with strength)
// and the antigens each one reacts with, the donor's tissue antigens, their blood groups, the hospital, and a liver
// donor's profile. Whether the donor's blood group can give to their own patient comes from the ABO_OK edge. Antibodies
// are gathered first: aggregating them after several OPTIONAL MATCHes on other nodes dropped them. Read-only.
MATCH (p:Pair {pair_id: $pair_id})-[:HAS_DONOR]->(d:Donor), (p)-[:HAS_PATIENT]->(r:Patient), (p)-[:REGISTERED_AT]->(h:Hospital)
OPTIONAL MATCH (r)-[k:HAS_ANTIBODY]->(ab:Antibody)
OPTIONAL MATCH (ab)-[:REACTS_WITH]->(t:HLAAntigen)
WITH p, d, r, h, ab, k, collect(DISTINCT t.name) AS targets
WITH p, d, r, h, collect(CASE WHEN ab IS NULL THEN null ELSE {name: ab.specificity, mfi: k.mfi, reacts_with: targets} END) AS antibodies
OPTIONAL MATCH (d)-[:HAS_ANTIGEN]->(ag:HLAAntigen)
WITH p, d, r, h, antibodies, collect(DISTINCT {name: ag.name, locus: ag.locus}) AS antigens
OPTIONAL MATCH (d)-[:HAS_ABO]->(dg:BloodGroup)
OPTIONAL MATCH (r)-[:HAS_ABO]->(rg:BloodGroup)
OPTIONAL MATCH (dg)-[ok:ABO_OK]->(rg)
OPTIONAL MATCH (d)-[:HAS_LIVER]->(lv:LiverProfile)
RETURN p.pair_id AS pair_id, p.organ AS organ, p.status AS status, p.approval_state AS approval_state,
       h.code AS code, h.city AS city, properties(d) AS donor, properties(r) AS patient,
       dg.t AS donor_abo, rg.t AS patient_abo, ok IS NOT NULL AS own_abo_ok,
       CASE WHEN lv IS NULL THEN null ELSE properties(lv) END AS liver, antigens, antibodies
```

### Q56_links_around

Read-only (`GRAPH.RO_QUERY`). File: [`backend/queries/Q56_links_around.cypher`](../backend/queries/Q56_links_around.cypher)

```cypher
// Live donation links out of a set of families (what their donors can give) and, when $to is given, only into that
// set: the explorer's hops. Hop 1 is the links out of and into one family; hop 2 and 3 follow the same edges one step
// further. Each link carries its chance and the reasons stored on it. Read-only.
MATCH (a:Pair)-[e:CAN_GIVE_TO]->(b:Pair)
WHERE e.status = 'live' AND ($from IS NULL OR a.pair_id IN $from) AND ($to IS NULL OR b.pair_id IN $to)
RETURN a.pair_id AS from_pair, b.pair_id AS to_pair, e.p_success AS p, e.reasons AS reasons, b.status AS to_status,
       a.status AS from_status
ORDER BY p DESC
LIMIT $limit
```

### Q57_loops_through

Read-only (`GRAPH.RO_QUERY`). File: [`backend/queries/Q57_loops_through.cypher`](../backend/queries/Q57_loops_through.cypher)

```cypher
// Every 2-way and 3-way swap loop through one family over live links, whatever stage the other families are at: the
// explorer shows a swap closing back to the family at hop 2 (2-way) or hop 3 (3-way). Edge aliases are all referenced
// (FalkorDB otherwise only checks that some edge exists). Read-only.
MATCH (c:Pair {pair_id: $pair_id})-[e1:CAN_GIVE_TO]->(b:Pair)-[e2:CAN_GIVE_TO]->(c)
WHERE e1.status = 'live' AND e2.status = 'live'
RETURN [c.pair_id, b.pair_id] AS pairs, [e1.p_success, e2.p_success] AS probs
UNION
MATCH (c:Pair {pair_id: $pair_id})-[e1:CAN_GIVE_TO]->(b:Pair)-[e2:CAN_GIVE_TO]->(x:Pair)-[e3:CAN_GIVE_TO]->(c)
WHERE id(b) <> id(x) AND e1.status = 'live' AND e2.status = 'live' AND e3.status = 'live'
RETURN [c.pair_id, b.pair_id, x.pair_id] AS pairs, [e1.p_success, e2.p_success, e3.p_success] AS probs
```

### Q58_why_no_link

Read-only (`GRAPH.RO_QUERY`). File: [`backend/queries/Q58_why_no_link.cypher`](../backend/queries/Q58_why_no_link.cypher)

```cypher
// Why one family's donor can't give to another family's patient, from the graph: the ABO_OK edge between their blood
// groups, the patient's antibodies (at or above $mfi) that react with an antigen the donor carries, a remembered FAILED
// link, the live CAN_GIVE_TO link if there is one, and, for liver, the donor's profile and the patient's weight.
// Antibodies are gathered before the other OPTIONAL MATCHes (aggregating them later dropped rows). Read-only.
MATCH (a:Pair {pair_id: $donor_pair})-[:HAS_DONOR]->(d:Donor), (b:Pair {pair_id: $patient_pair})-[:HAS_PATIENT]->(t:Patient)
OPTIONAL MATCH (t)-[k:HAS_ANTIBODY]->(ab:Antibody)-[:REACTS_WITH]->(h:HLAAntigen)<-[:HAS_ANTIGEN]-(d)
WHERE k.mfi >= $mfi
WITH a, b, d, t, collect(DISTINCT h.name) AS clash
OPTIONAL MATCH (d)-[:HAS_ABO]->(dg:BloodGroup)
OPTIONAL MATCH (t)-[:HAS_ABO]->(tg:BloodGroup)
OPTIONAL MATCH (dg)-[ok:ABO_OK]->(tg)
OPTIONAL MATCH (a)-[f:FAILED]->(b)
OPTIONAL MATCH (a)-[e:CAN_GIVE_TO]->(b)
OPTIONAL MATCH (d)-[:HAS_LIVER]->(lv:LiverProfile)
RETURN a.organ AS donor_organ, b.organ AS patient_organ, b.status AS patient_status, dg.t AS donor_abo, tg.t AS patient_abo,
       ok IS NOT NULL AS abo_ok, clash, f.cause AS failed_cause, f.detail AS failed_detail,
       e IS NOT NULL AS linked, e.status AS link_status, t.weight_kg AS patient_weight_kg,
       CASE WHEN lv IS NULL THEN null ELSE properties(lv) END AS liver
```

### Q59_match_ease

Read-only (`GRAPH.RO_QUERY`). File: [`backend/queries/Q59_match_ease.cypher`](../backend/queries/Q59_match_ease.cypher)

```cypher
// How easy each waiting family is to place in a swap: PageRank over CAN_GIVE_TO. A link points from a family whose
// donor can give to a family whose patient can receive, so a family's score is high when many donors can reach its
// patient, and those donors are themselves easy to reach. Low scores are the hardest patients to match. Read-only.
CALL algo.pageRank('Pair', 'CAN_GIVE_TO') YIELD node, score
WHERE node.status = 'waiting' AND ($organ IS NULL OR node.organ = $organ)
RETURN node.pair_id AS pair_id, node.organ AS organ, score
ORDER BY score DESC
```

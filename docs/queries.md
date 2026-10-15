# KindRed planned query list (spec, not code)

Each query becomes one file in `backend/queries/` on or after Oct 15, named by its ID. The UI shows the query text next to its result, and the README lists each with measured latency. Patterns below describe the shape of the match; final Cypher is written and tested during the event.

Rules for every query: parameterised (no string building), edge aliases always referenced, exclude `CAN_GIVE_TO.status = 'failed'`, exclude pairs not in `waiting` unless the query says otherwise.

## Must-have

| ID | Name | Inputs → outputs | Pattern / logic | Day |
|---|---|---|---|---|
| Q01 | `upsert_pair` | pair fields, expected `version` → new version or conflict | MERGE on `pair_id`; write only if stored `version` equals expected; bump version | 1 |
| Q02 | `build_edges_for_pair` | `pair_id` → edges created | Two passes (new pair as giver, then as receiver): donor `HAS_ABO`→`ABO_OK`→ patient's group; attach reasons text. O(n) per new pair | 1 |
| Q03 | `virtual_crossmatch` | donor pair, patient pair, MFI threshold → negative/risk + conflicting antigens | `(d:Donor)-[:HAS_ANTIGEN]->(h:HLAAntigen)<-[:REACTS_WITH]-(:Antibody)<-[ab:HAS_ANTIBODY]-(p:Patient) WHERE ab.mfi >= $t`; any hit = risk; untyped DQ/DP lowers `p_success` | 1 |
| Q04 | `two_way_loops` | filters → list of (a, b, e1, e2) | `(a)-[e1:CAN_GIVE_TO]->(b)-[e2:CAN_GIVE_TO]->(a)`, `id(a) < id(b)` so each appears once | 2 |
| Q05 | `three_way_loops` | filters → list of (a, b, c, e1..e3) | One more hop, `id(a)` smallest of the three | 2 |
| Q06 | `fallbacks_inside` | loop ids → loops that contain a 2-way loop | For a 3-way loop a→b→c→a, check for any reverse edge (b→a, c→b, a→c) that forms a 2-way loop; store as `FALLBACK_FOR` (the design's "has 2-way fallback") | 2 |
| Q07 | `components` | → component id per pair | `algo.wcc` over waiting pairs; solver runs per component | 2 |
| Q08 | `save_plan` | solver output → `Plan` + `Loop` nodes, `IN_LOOP` and `CONTAINS` edges | Writes the chosen set; status `selected` | 2 |
| Q09 | `offer_loop` | `loop_id` → offers | Creates one `Offer` per pair; sets pairs to `offered`; refuses if any pair is already offered or locked (prevents double-offering a donor) | 2 |
| Q10 | `record_failure` | test or offer id, reason → failure id, released pairs | Creates `Failure`; adds `FAILED {cause, at}` edge donor-pair→patient-pair; marks the `CAN_GIVE_TO` edge failed; loop → `broken`; its pairs back to `waiting` | 3 |
| Q11 | `local_repair_candidates` | released pair ids, hops (2 or 3) → candidate loops | Take the subgraph within 2–3 `CAN_GIVE_TO` hops of the released pairs, excluding locked/offered pairs and failed edges; run the Q04/Q05 patterns only inside it. This is the "repair near the break" step | 3 |
| Q12 | `fallbacks_for` | broken loop id → still-valid fallback loops | Follow `FALLBACK_FOR`; drop any whose edges are now failed | 3 |
| Q13 | `explain_loop` | loop id → per-edge reasons, risk antigens, p_success | Walks `IN_LOOP` order and collects `reasons[]` from each edge. The only input to explanation text | 2 |
| Q14 | `decision_trail` | loop or pair id → ordered decisions with their `BASED_ON` facts | Follows `REPLACED_BY` and `Decision-[:BASED_ON]` and `APPROVED_BY` | 3 |
| Q15 | `loop_committee_readiness` | loop id → each pair's `approval_state`, due date; blocking pair | The pair with the latest due date or a missing document blocks the loop | 3 |
| Q16 | `family_status` | pair id → timeline of own events only | Reads only that pair's events; never returns other pairs' fields | 3 |
| Q17 | `failure_priors` | lab or hospital code → failure counts by kind | Counts `Failure` nodes linked through tests at that lab; feeds `p_success` on new edges (episodic → semantic memory) | 3 |
| Q18 | `events_since` | seq → new events | Feeds the UI event stream | 2 |
| Q24 | `loop_links` | loop ids → one row per donation, in order, with chance, reasons and any remembered failure | Feeds the clickable map on Live pool | built |
| Q21 | `liver_edges_for_pair` | pair_id → liver links both ways | Q02's shape for liver: ABO traversal, then graft size (GRWR ≥ 0.8%, donor keeps ≥ 30%), left lobe first, right lobe only if `right_lobe_ok`. Reasons, lobe and GRWR are written on the edge. Run through `swapnet/organs/liver.py` | built |

| Q25 | `program_pairs` | organ (or null), optional ids → shared facts per pair | One program's pool table: kidney cPRA, untyped loci, crossmatch results; liver MELD, weight, volumetry and evaluation statuses. No identities | built |
| Q26 | `loop_evidence` | loop id → per link: edge facts, test, failure, organs of both pairs | Evidence for each recommendation (`swapnet/programs.py`); also proves the loop never mixed organs | built |
| Q27 | `integrity_shared` | organ (or null) → findings | Missing hospital or pair references, cross-organ links or loops, broken links, links without reasons, status mismatches, repairs without a recorded approval, open reviews | built |
| Q28 | `integrity_kidney` | → findings | Missing cPRA; untyped loci awaiting a crossmatch; committee-stage links without a negative crossmatch | built |
| Q29 | `integrity_liver` | → findings | Missing LiverProfile; graft size still estimated at committee stage; open anatomical, donor, recipient or surgical suitability reviews | built |
| Q30 | `exchange_candidates` | organ, pair id → live links in and out | `find_exchange_candidates` MCP tool and `/api/matches`; returns nothing unless the organ is the pair's own | built |
| Q31 | `pair_link_counts` | organ (or null) → live links per pair and direction | "Candidate exchanges" column (counted apart from Q25: FalkorDB mis-counted chained OPTIONAL MATCH counts) | built |
| Q32 | `withdrawal_impact` | pair id → its live loops, the other families, whether each stored fallback survives | Ask KindRed `withdrawal_impact`, MCP | built |
| Q33 | `reachable_within` | pair id, hops (1–3), limit → waiting same-program families reachable over live links, shortest route each | Ask KindRed `reachable_within` (same question at two depths), MCP. `*1..3` plus `length(path) <= $hops`, since FalkorDB doesn't take a parameter as a path bound | built |
| Q34 | `connection_path` | two pair ids → `shortestPath` over `CAN_GIVE_TO` (same program only) | Ask KindRed `connection_path`, MCP. `shortestPath` only works in `RETURN`/`WITH` in FalkorDB | built |
| Q35 | `failure_memory` | pair id → FAILED links on either side, with the proving test | Ask KindRed `failure_memory`, MCP | built |
| Q36 | `resolve_ids` | ids → pair or loop, organ, hospitals (kind null = not in the graph) | Every Ask KindRed tool resolves and scope-checks ids with it before any traversal | built |
| Q37 | `remember_answer` | a verified answer → `Question` node `ABOUT` its pairs and loops, with its scope | Ask KindRed memory (the agent's only write) | built |
| Q38 | `recall` | ids → earlier answers about them, dated, with scope | Ask KindRed `recall`, MCP; filtered to the viewer's hospitals and program | built |
| Q39 | `recent_questions` | limit → latest answers | Ask screen history (`/api/ask/history`) | built |

Every named query without a write clause runs through `GRAPH.RO_QUERY` (`db.is_read_only`), so FalkorDB refuses a write from it.

Q04, Q05 and Q11 take `$organ` (null = every program) and require every pair of a loop to share one organ. Q19 (`bridge_pairs`) is also built: the Live pool tags the top five bridge families.

## Stretch

| ID | Name | What it shows | Day |
|---|---|---|---|
| Q19 | `bridge_pairs` | Betweenness centrality on `CAN_GIVE_TO`: pairs whose withdrawal breaks the most loops (built; shown on Live pool) | 3–4 |
| Q20 | `hard_to_match` | Low in-degree patients (often O, high cPRA) for the fairness panel | 4 |
| Q22 | `integrity_flags` | Hospital graph: `SHARES_ATTRIBUTE` across unrelated pairs, one donor in two pairs; `algo.cdlp` for rings. Flag only; a human reviews | 4 |
| Q23 | `fairness_stats` | Match rate by blood group, cPRA band, donor sex | 4 |

## Things to verify on Day 1 (don't assume)

- Exact names and signatures of FalkorDB algorithms (`algo.wcc`, betweenness, `algo.cdlp`) in the current release.
- Whether variable-length patterns with a hop limit (for Q11) are fast enough at 300 / 1,000 / 5,000 pairs, or whether Q11 should collect the neighbourhood first and then run Q04/Q05 with an `IN $ids` filter.
- Write behaviour under concurrent agents (are writes serialised per graph?). Measure, don't claim.

## Latency targets to report

Q04/Q05 at 300, 1,000, 5,000 pairs; Q11 repair end to end (failure recorded → new loop selected); write throughput with several intake agents writing while the matcher reads.

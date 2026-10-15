# KindRed graph schema (planning draft, freeze before Oct 15)

All data is synthetic. Labels are PascalCase, relationship types UPPER_SNAKE, properties snake_case. Names follow the KindRed product design ("What the graph actually holds").

## Graphs (tenancy)

| Graph key | Holds | Who writes |
|---|---|---|
| `hosp_<city>` (e.g. `hosp_hyd`, `hosp_blr`, `hosp_kol`, `hosp_che`) | One private graph per hospital: synthetic identities, kinship proof, documents, approval stages, contact details | That hospital's intake agent only |
| `exchange` | Shared pool: de-identified pairs with only the medical fields matching needs, compatibility edges, loops, plans, offers, crossmatches, failures, decisions, tasks | Matching engine, workflow agents, intake agents (offer responses only) |
| `kb` (stretch) | HLA antigen equivalences; AyurDisha herb → compound → enzyme → drug | Loaders |

A pair is published from its hospital graph to `exchange` only when consent to share is true, the donor–patient relation is on the near-relative list, and both people are Indian nationals. The same `pair_id` is used in both graphs. Names, phones, addresses and documents never leave the hospital graph.

Near-relative list (THOTA): spouse, mother, father, son, daughter, brother, sister, grandmother, grandfather, grandson, granddaughter. Config, not code.

## Exchange graph

### Nodes

| Label | Properties | Notes |
|---|---|---|
| `Pair` | `pair_id` (P-0154), `organ` (kidney/liver), `status` (waiting, offered, locked, transplanted, withdrawn), `approval_state` (not_started, submitted, docs_verified, interview_scheduled, approved, rejected), `approval_due`, `priority`, `entered_at`, `failed_count`, `version` | Hub. `version` is the optimistic lock for concurrent writes |
| `Patient` | `abo`, `cpra`, `sex`, `age_band`, `weight_kg`, `height_cm`; liver: `meld`, `recipient_evaluation`, `surgical_review` | No identity fields. Liver statuses are ELIGIBLE, REVIEW_REQUIRED, UNKNOWN or INELIGIBLE (program configuration, not diagnoses) |
| `Donor` | `abo`, `relation`, `sex`, `age_band`, `bmi`, `untyped_loci[]` | |
| `LiverProfile` | `liver_volume_ml`, `steatosis`, `right_lobe_ok`, `left_lobe_ml`, `right_lobe_ml`, `volumetry` (ct, estimate), `anatomy_review`, `donor_evaluation` (statuses) | Attached to liver donors only. `estimate` = height-and-weight formula until CT volumetry is back; a failed work-up overwrites it with the CT values |
| `BloodGroup` | `t` (O, A, B, AB) | Four nodes; ABO rules live as edges |
| `HLAAntigen` | `name` (A2, B35, DR15, DQ7), `locus` | Shared antigen nodes |
| `Antibody` | `specificity` | Linked to the antigens it reacts with, so antigen-equivalence tables are graph data |
| `Hospital` | `code`, `city`, `lab_code`, `lat`, `lon` | `lat/lon` for the India map |
| `Plan` | `run_id` (#42), `at`, `policy`, `solve_ms`, `optimal`, `expected_tx`, `planned_tx` | Every match run kept as history |
| `Loop` | `loop_id` (S-0031 kidney, L-0031 liver), `kind` (2-way, 3-way, chain), `organ`, `p_success`, `expected_tx`, `status` (candidate, selected, offered, testing, committee, locked, broken, done), `has_fallback` | |
| `Offer` | `offer_id`, `response` (pending, accept, decline, hold), `reason`, `at` | One per pair per loop |
| `Crossmatch` | `test_id`, `kind` (crossmatch, volumetry), `result` (pending, negative, positive), `lab_code`, `requested_at`, `due_at`, `antibody` | The pre-surgery test on one link: a lab crossmatch for kidney, the donor work-up (CT volumetry) for liver |
| `Failure` | `failure_id`, `cause` (positive_xm, graft_too_small, refusal, withdrawal, too_ill, approval_rejected), `at`, `detail` | Episodic memory |
| `Decision` | `decision_id`, `action` (select_plan, propose_repair, approve_repair, use_fallback, escalate, accept, decline, hold), `rationale`, `at` | Audit trail |
| `Agent` | `name`, `kind` (intake, matching, crossmatch, committee, liaison, scheduler, integrity, medication, human) | |
| `Task` | `task_id`, `kind`, `status`, `due` | Hand-offs and human approvals |
| `SurgerySlot` (stretch) | `hospital`, `starts_at`, `theatre` | |
| `Event` | `seq`, `type`, `payload`, `at` | Append-only log the UI streams from |

### Relationships

| Pattern | Properties | Purpose |
|---|---|---|
| `(Pair)-[:HAS_DONOR]->(Donor)`, `(Pair)-[:HAS_PATIENT]->(Patient)` | | |
| `(Pair)-[:REGISTERED_AT]->(Hospital)` | | |
| `(Donor\|Patient)-[:HAS_ABO]->(BloodGroup)` | | |
| `(BloodGroup)-[:ABO_OK]->(BloodGroup)` | | 9 edges: O→all, A→A/AB, B→B/AB, AB→AB. Edge building is a traversal |
| `(Donor)-[:HAS_ANTIGEN]->(HLAAntigen)` | | Donor typing (A, B, DR; DQ/DP when typed) |
| `(Patient)-[:HAS_ANTIBODY {mfi}]->(Antibody)-[:REACTS_WITH]->(HLAAntigen)` | `mfi` | Virtual crossmatch = donor antigen ← antibody ← patient, above an MFI threshold |
| `(Donor)-[:HAS_LIVER]->(LiverProfile)` | | |
| `(Pair)-[:CAN_GIVE_TO]->(Pair)` | `organ` (the program whose rule built it; always both pairs' organ), `reasons[]`, `p_success`, `abo_ok`, `vxm` (clear, risk), `risk_antigens[]`, `status` (live, failed), `built_at`; liver: `lobe`, `grwr`, `remnant_pct`, `anatomy_review` | **The central edge.** `reasons[]` holds text like "O+ → B+", "virtual test clear", "DQ typed" so every explanation is read from the edge |
| `(Pair)-[:FAILED {cause, at}]->(Pair)` | `cause`, `at`, `test_id` | **Failure memory as an edge.** Loop queries never use a donor→patient link that has one |
| `(Pair)-[:IN_LOOP {pos}]->(Loop)` | `pos` | Order in the loop |
| `(Plan)-[:CONTAINS]->(Loop)` | | |
| `(Loop)-[:FALLBACK_FOR {trigger}]->(Loop)` | `trigger` (which pair drops) | e.g. the 2-way inside a 3-way |
| `(Loop)-[:REPLACED_BY]->(Loop)` | `decision_id` | Repair history |
| `(Offer)-[:FOR]->(Loop)`, `(Offer)-[:TO]->(Pair)` | | |
| `(Crossmatch)-[:DONOR_OF]->(Pair)`, `(Crossmatch)-[:PATIENT_OF]->(Pair)`, `(Crossmatch)-[:IN]->(Loop)` | | |
| `(Failure)-[:BROKE]->(Loop)`, `(Failure)-[:EVIDENCED_BY]->(Crossmatch\|Offer)` | | |
| `(Decision)-[:MADE_BY]->(Agent)`, `(Decision)-[:BASED_ON]->(Loop\|Failure\|Offer\|Plan)`, `(Decision)-[:APPROVED_BY]->(Agent {kind:'human'})` | | Every decision points at the facts it used and who approved it |
| `(Task)-[:ASSIGNED_TO]->(Agent)`, `(Task)-[:ABOUT]->(Pair\|Loop)` | | |
| `(Loop)-[:SCHEDULED_IN]->(SurgerySlot)` (stretch) | | |

### Indexes

`Pair(pair_id)`, `Pair(status)`, `Loop(loop_id)`, `Loop(status)`, `HLAAntigen(name)`, `Hospital(code)`, `Event(seq)`. Verify FalkorDB index syntax on Day 1.

### Known FalkorDB gotcha

If an edge alias isn't referenced elsewhere in a query, FalkorDB only checks that *some* such edge exists, which can undercount. Always name and reference edge aliases in loop queries. Say so in the README.

## Hospital graph (private)

| Label | Properties |
|---|---|
| `Pair` | `pair_id`, `published`, `consent_shared`, `version` |
| `Person` | `name`, `role` (donor, patient), `dob`, `nationality`, `phone_hash`, `address_hash`, `id_hash` (all synthetic); donors: `full_typing` (kidney), `ct_*` volumes and `evaluation_note` (liver: the private note behind the shared statuses) |
| `Document` | `type` (hla_report, blood_group_card, relationship_proof, id_proof, consent, no_commercial_declaration, form18_draft), `status` (missing, uploaded, verified), `hash` |
| `Approval` | `stage` (application, document_verification, interview, decision, appeal), `opened_at`, `due`, `status` |
| `Committee` | `level` (hospital, district, state) |

| Relationship | Purpose |
|---|---|
| `(Pair)-[:DONOR]->(Person)`, `(Pair)-[:PATIENT]->(Person)` | |
| `(Person)-[:NEAR_RELATIVE_OF {relation}]->(Person)` | Checked before publish |
| `(Pair)-[:NEEDS_DOC]->(Document)` | Committee file and "what's missing" (5 documents per pair in the design) |
| `(Pair)-[:REQUIRES_APPROVAL]->(Approval)-[:BY]->(Committee)` | Deadline clock |
| `(Person)-[:SHARES_ATTRIBUTE {attr}]->(Person)` (stretch) | Integrity checks across pairs |

Approval deadlines (Delhi HC, *Amar Singh Bhatia*, Jan 2024): 10 days to process, 14 days to verify documents, 4–6 weeks to schedule the interview, 6–8 weeks end to end (the design's "day 3 of 42"), 30 days for appeal. Mirror only `approval_state` and `approval_due` into the exchange `Pair`.

## Knowledge graph (stretch)

`(Herb)-[:CONTAINS]->(Compound)-[:INHIBITS|INDUCES]->(Enzyme)`, `(Drug)-[:METABOLISED_BY]->(Enzyme)`, with `evidence_tier` (A–E, or "studied, no effect") on each interaction edge. Imported from AyurDisha during the event.

## Event flow

1. Intake agent writes a pair to its hospital graph; unclear lab values become a human task.
2. Publisher checks consent, near-relative and nationality, upserts the de-identified pair into `exchange` (version-checked) and builds only that pair's `CAN_GIVE_TO` edges in and out.
3. Match run: Cypher finds candidate loops, the optimiser picks a plan, loops go to `selected`, offers go to intake agents.
4. Offer responses and crossmatch results come back as `Offer` / `Crossmatch` nodes. A failure writes a `Failure` node and a `FAILED` edge, marks the `CAN_GIVE_TO` edge failed, breaks the loop and releases its pairs (priority raised for the pair that failed).
5. Matching agent proposes a local repair; a person approves it; a `Decision` records both.

## Open questions to settle before Oct 15

- **Chains.** The design mentions "chains from altruistic donors". Indian law restricts non-directed donation, so chains stay behind a policy switch, off in the demo.
- `p_success` formula per edge. Default: from published failure rates (10% crossmatch failure if cPRA ≤ 90, 38% if > 90; 15–27% offer refusal), lowered for each untyped DQ/DP locus, adjusted by past failures at that lab.
- Liver thresholds (GRWR ≥ 0.8%, remnant ≥ 30%) as config.

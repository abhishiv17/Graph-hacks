# KindRed agents and MCP tools

Principle: **the graph finds options, the optimiser ranks them with stated rules, agents act on them, people approve.** AI never decides who gets an organ. LLM text (rationales, family messages, committee drafts) is built only from facts a query returned, and every message carries the query it came from. "Every reason above is read from the edge in the graph, not written by the AI."

## The eight agents from the design, tiered for four days

Project memory says hospital agents accept, decline or hold, and a coordinator recovers or escalates. The design names eight agents. They map onto each other like this:

| Agent (design name) | Role in memory's model | What it does | Tier |
|---|---|---|---|
| **Intake agent** (one per hospital) | Hospital agent | Adds pairs from lab reports (synthetic), sends unclear values to a person, publishes to the exchange, and answers offers with accept, decline or hold | Must (document reading is stretch; Day 1 uses structured input) |
| **Matching agent** | Coordinator | Runs plans, explains loops, proposes the local repair when a loop breaks, escalates when no good repair exists | Must |
| **Crossmatch coordinator** | Coordinator helper | Moves each link through Offered → Both teams accept → Lab test → Result → Locked; chases overdue results; reports positives | Must |
| **Committee clerk** | | Builds each pair's committee file, tracks documents, shows the slowest pair blocking the loop against the 6–8 week target | Must |
| **Patient liaison** | | Writes the family's "Your case" view from that pair's facts only, in EN / हिन्दी / தமிழ் | Must (English), stretch (Hindi, Tamil) |
| **Scheduler** | | Same-day theatre slots across cities (CP-SAT) | Stretch |
| **Integrity agent** | | Shared phone, address or document across unrelated pairs; community detection; human review only, nothing blocked automatically | Stretch |
| **Medication safety** | | Herb → enzyme → anti-rejection drug warnings from AyurDisha's graph; always "talk to your transplant team" | Stretch |

Agents hand off through `(:Task)-[:ASSIGNED_TO]->(:Agent)` nodes in the graph, so a hand-off survives a restart.

### Intake agent: offer policy

| Condition (checked in order) | Response |
|---|---|
| Pair withdrawn, or patient marked too ill | decline |
| `approval_state = rejected` | decline |
| A required document is missing and the loop's surgery window ends before `approval_due` | hold, naming the document |
| Link `vxm = risk` and the hospital wants a lab test first | hold until the crossmatch returns |
| Otherwise | accept and request the lab crossmatch |

One YAML policy per hospital, so the demo can show two hospitals behaving differently. The LLM writes the one-line rationale from the rule that fired.

### Matching agent: plan, repair, escalate

| Situation | Action |
|---|---|
| Match run due | `components` → `find_loops` → `optimise` → `save_plan` → `explain` → `offer_loop`; each step logged |
| A link fails | `record_failure` → `fallbacks_for` → `local_repair` (2–3 hops around the break, other loops untouched) → `optimise` on those candidates → **propose** the top repair with its fallback and alternatives ("Approve repair / See 2 alternatives") |
| A person approves | Apply the repair, new offers go out, `Decision` gets `APPROVED_BY` |
| No repair above threshold, or it touches a held pair | **Escalate**: a human `Task` with the options and the facts behind each |
| The released pair failed on antibodies | Raise its priority ("failed once") so the next run favours it |

The LLM chooses the order of tool calls (Track 1's "tool selection via MCP", visible in "What the agents are doing"). It can't propose a plan the optimiser didn't rank, and can't skip escalation when a threshold says escalate.

### Memory (Track 2)

| Kind | Where it lives |
|---|---|
| Episodic | `Failure`, `Offer`, `Crossmatch` nodes and `FAILED {cause, at}` edges |
| Semantic | Learned failure rates per lab ("DQ-untyped links from this lab now get a lower success estimate"); ABO and antigen rules as graph data |
| Procedural | Policies as data: intake YAML, playbook nodes such as "positive crossmatch on a 3-way with a fallback → use the stored 2-way, release the third pair" |
| Per tenant | One graph per hospital plus the shared exchange graph |
| Per person | One memory graph per demo patient (`mem_sunita`, `mem_rajesh`): `Session`, `Finding`, `Fact` (`SUPERSEDES`), `Playbook`/`Step` |

**What each agent read before acting** (`swapnet/agents/recall.py`). Every step stores the memories it used, who wrote
them and what it did with them: on the `Finding` (`read`, JSON) in the patient's memory graph, on the `Decision` (`read`,
one line each) in the exchange graph, and on a hand-off `Task` (`read`). Examples:

| Agent | Reads | Written by | Used for |
|---|---|---|---|
| Coordinator agent | beliefs (stage, trend, swap), the last 3 findings, the pool size at its last search, failed links for the patient, papers already requested | Health watch, itself, Crossmatch coordinator, Committee clerk | whether a swap is urgent; no repeat search on an unchanged pool; failed links never proposed; no paper asked twice |
| Health watch | the stage it remembers, the live swap, the stage's playbook | itself, Matching and Coordinator agents, the care team | only a more urgent stage acts; nothing new once surgery is booked; one task per playbook step |
| Matching agent | failed links in the pool or around released families (Q54), declined repairs | Crossmatch coordinator, Exchange coordinator (person) | those links are skipped and their families get priority; a declined repair is never proposed again |
| Scheduler, Committee clerk, Patient liaison | the task they pick up | Health watch | do that playbook step |

### Coordinator agent (demo patients): a language model choosing tools

`swapnet/agents/coordinator.py`. Each simulated week the model (Groq `openai/gpt-oss-120b` by default) gets the
patient's state, read from the graph (stage, trend, swap, missing papers, how the pool changed, the last things the
agents remembered, and the step the rules expect), and picks from six tools: `find_swaps` (max_size 2 or 3),
`form_swap`, `run_tests`, `request_papers`, `book_surgery`, `wait`. Each tool is human-written and checks its own
preconditions against the graph; one action per week. Every id in the model's reason must appear in the action's
result, or the reason is replaced by the result. If the model fails, or waits while a step is due, the rules run the
same tools (the safety net) and the trace says so. The same tools are on the MCP server (`patient_*`).

### Health watch and scheduler (demo patients, docs/personas.md)

| Agent | What it does |
|---|---|
| **Health watch** | Reads a demo patient's readings (hospital graph), works out stage, trend and projection against configured thresholds, compares with the stage it remembers (memory graph). Only a *more urgent* stage triggers its playbook, so it never repeats an alert |
| **Scheduler** | Books appointments in the hospital graph (fistula assessment, nephrology review, weekly MELD labs, donor work-up slot) and the transplant surgery once the committee file is complete; never double-books one already ahead |
| Matching agent | Marks the pair urgent (priority bonus `urgent` in intake.yaml), searches 2-way then 3-way swaps around it and forms the swap at once; while the pair waits, searches again whenever the pool changes |
| Crossmatch coordinator | Runs the tests on the patient's swap the week after it forms |
| Committee clerk, Patient liaison | Ask the hospitals for missing papers and file the committee case; write the family's message from the stage and the swap only |

The demo patients' journeys are fully agentic: no step waits for a person (docs/personas.md). The exchange story's repairs (S-0076, L-0034) still wait for the coordinator's approval.

Hand-offs are `Task {kind: 'handoff'}` nodes `ASSIGNED_TO` an agent and `ABOUT` the pair. Each agent picks up its own open tasks (`health.run_handoffs`), from the API and from the background watch.

## MCP tools (18 named, plus read-only Cypher)

Served by `backend/swapnet/mcp`. Each tool wraps named queries from `queries.md` or the optimiser and returns the query ID it ran, so the UI can show the Cypher. Built following Anthropic's mcp-builder skill (Python / FastMCP path), including its evaluation step.

| # | Tool | Wraps | Used by | Tier |
|---|---|---|---|---|
| 1 | `add_pair(fields)` | Q01, Q02, publish | Intake | must |
| 2 | `virtual_crossmatch(donor, patient)` | Q03 | Intake, Matching | must |
| 3 | `components()` | Q07 | Matching | must |
| 4 | `find_loops(max_len, component?)` | Q04, Q05, Q06 | Matching | must |
| 5 | `optimise(candidates, policy)` | optimiser | Matching | must |
| 6 | `save_plan(plan)` | Q08 | Matching | must |
| 7 | `explain(loop_id)` | Q13 | all | must |
| 8 | `offer_loop(loop_id)` | Q09 | Matching | must |
| 9 | `respond_offer(offer_id, response, reason)` | Offer write | Intake | must |
| 10 | `record_crossmatch(test_id, result)` | Crossmatch write → Q10 on positive | Crossmatch coordinator | must |
| 11 | `record_failure(ref, cause, detail)` | Q10 | all | must |
| 12 | `local_repair(pair_ids, hops)` | Q11, Q12, optimiser | Matching | must |
| 13 | `decision_trail(id)` | Q14 | Matching, UI | must |
| 14 | `committee_readiness(loop_id)` | Q15 | Committee clerk | must |
| 15 | `escalate(task)` | Task write | Matching, Committee clerk | must |
| 16 | `patient_status(pair_id)` | Q16 | Patient liaison | must |
| 17 | `scan_integrity()` | Q22 | Integrity | stretch |
| 18 | `herb_check(pair_id, herb)` | kb graph | Medication safety | stretch |

Plus FalkorDB's own MCP server in read-only mode (`FALKORDB_DEFAULT_READONLY=true`) for raw Cypher.

## Optimiser (the only non-graph decision step)

Input: candidate loops from the graph, never the raw pool. Objectives in order: expected transplants (a loop's size times the product of its links' `p_success`), then blood group O and highly sensitised patients matched, then priority score. Each pair in at most one loop; locked loops fixed. Baseline: 2-way only. Solved per component; the UI shows "solved in 1.9 s · optimal".

## Concurrency

- Optimistic `version` on `Pair`; a stale write is refused and retried (Q01).
- `offer_loop` refuses if any pair is already offered or locked.
- Load test, measured: `python -m swapnet.sim.concurrency` (`swapnet/sim/concurrency.py`) runs in a scratch graph, never
  the demo graph. 1–16 intake agents publish families while two matchers search every loop; 1–16 agents update their own
  families while the matcher searches a pool of fixed size; 2–16 agents update one family at the same moment, with and
  without the version check. Results in `data/generated/concurrency.json`, the README and the How it works screen.

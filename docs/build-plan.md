# KindRed build plan: Oct 15–18, 2026

Submission closes **Oct 18, 23:59 IST**. Times below are IST. Owners are placeholders; swap in names.

| Owner | Area |
|---|---|
| **A** | Graph: schema setup, all Cypher queries, tenancy and publish, query benchmarks |
| **B** | Data and solver: synthetic generator, validation, solver, simulation lab |
| **C** | Agents: MCP server, intake, matching, crossmatch, committee clerk and liaison agents, FastAPI and event stream |
| **D** | Web and story: Next.js UI, demo scenario, video, README |

With fewer than four people, merge B into A and D into C.

## Before Oct 15 (allowed: ideation, notes, graph-model planning)

- [ ] Everyone reads `schema.md`, `queries.md`, `agents-and-tools.md`; settle the open schema questions at the end of `schema.md` and freeze the schema.
- [ ] Recheck the official rules and schedule page (search results still show a stale listing).
- [ ] Agree owners and the demo script; sketch screens on paper.
- [ ] Accounts: FalkorDB Cloud, LLM API key, Vercel, GitHub org. Install Docker and pull the FalkorDB image.
- [ ] Read FalkorDB docs: Cypher known limitations, `algo.*` procedures, multi-graph, MCP server config.
- [ ] Install the chosen skills (see `skills.md`) and finish `.claude/skills/swapnet-graph/SKILL.md` (schema + Cypher conventions) so every Claude session uses the same names.
- [ ] Run Matt Pocock's `to-tickets` on this plan to turn each day's blocks into tickets with blocking edges (tickets are planning, not code).
- [ ] Don't: `git init` or push to GitHub, scaffold apps, write `.cypher` files, or write generator code. The folder skeleton and placeholder READMEs already exist and are fine.

## Day 1, Thu Oct 15: data in the graph

| Time | A | B | C | D |
|---|---|---|---|---|
| 00:01–02:00 (optional) | `git init`, first commit of the skeleton, push public repo; compose file with FalkorDB | | | |
| 09:00–13:00 | Schema setup script, indexes, `BloodGroup` + `ABO_OK` seed; Q01 upsert with version check | Param YAML from `synthetic_data.md`; Saidman-IN kidney generator (ABO, PRA bands, HLA from Indian frequencies) | FastAPI skeleton, FalkorDB client, Q18 event stream over SSE | Next.js app with the design's left nav (Live pool, Swaps in progress, Committee files, Surgery planner, Integrity review, Medication safety, Simulation lab); Live pool page reading a fixture |
| 14:00–19:00 | Q02 incremental edges with reasons, Q03 virtual crossmatch; tenant graphs + publish rule (consent, near-relative, nationality) | Generator validation: 2-way ≈ 49.8%, 2+3-way ≈ 59.8% matched at n = 100 (tested once solver exists; for now compare pool stats) | MCP server skeleton with `explain` and `find_loops` stubs wired to A's queries as they land | Live pool: India map with loops, stat tiles (pairs waiting, loops in plan, expected transplants, O patients prioritised) |
| 20:00–23:00 | Load 300-pair pool; time Q02 | Demo scenario seed `s0031`: Hyderabad, Bengaluru, Kolkata, Chennai; no in-hospital match; the 3-way loop with a 2-way fallback; Chennai P-0377 as the repair candidate | Intake agent policy YAML loader | "Viewing as" switch: one hospital's private view (tenant isolation visible) |

**Exit check:** a 300-pair synthetic pool and the 3-hospital demo scenario are in FalkorDB, with `CAN_GIVE_TO` edges carrying reasons, visible in the browser.

## Day 2, Fri Oct 16: find and offer loops

| Time | A | B | C | D |
|---|---|---|---|---|
| 09:00–13:00 | Q04, Q05 (alias rule), Q06 fallbacks inside 3-way loops, Q07 components | Solver: expected-transplant objective, priority for O and high cPRA, per component; 2-way baseline | MCP tools via mcp-builder (FastMCP): `components`, `find_loops`, `optimise`, `save_plan`, `explain`, `offer_loop` | Swap detail page: family cards with arrows, per-link reasons, Cypher panel |
| 14:00–19:00 | Q08 save plan, Q09 offer (no double-offer), Q13 explain | Re-run Saidman validation with the real solver; record numbers | Matching agent runs a plan: components → loops → optimise → save → offer, each step logged as a `Decision` | "What the agents are doing" feed streaming events |
| 20:00–23:00 | Benchmark Q04/Q05 at 300 / 1,000 / 5,000 | Delorme mode | Intake agents respond accept / hold from policy; LLM rationale from `explain` output | Crossmatch workflow table (Offered → Both teams accept → Lab test → Result → Locked) |

**Exit check:** pressing "Run match" shows the matching agent finding the 3-way loop, explaining it, offering it, and the intake agents answering.

## Day 3, Sat Oct 17: break it and repair it (the demo's core)

| Time | A | B | C | D |
|---|---|---|---|---|
| 09:00–13:00 | Q10 record failure (`FAILED` edge), Q12 fallbacks, Q11 local repair within 2–3 hops | Edge `p_success` from failure rates; Q17 failure priors feeding new edges | Crossmatch coordinator state machine; demo control "inject positive crossmatch"; matching agent proposes repair; **Approve repair** task; escalate when below threshold | Repair panel: failed link in red, recommended repair, kept fallback, "Approve repair / See 2 alternatives"; Decision memory panel |
| 14:00–19:00 | Q14 decision trail, Q15 approval readiness, Q16 family status | Simulation lab v1: one synthetic year, pooled vs single-hospital, failure-aware vs blind | Committee clerk and patient liaison agents; escalation tasks; hold-past-deadline path | Committee readiness (documents per pair, day X of 42, blocking pair); "Your case" family page |
| 20:00–23:00 | **Full rehearsal of demo beats 1–5** | Monte Carlo runs with confidence intervals | Fix whatever the rehearsal breaks | Fix whatever the rehearsal breaks |

**Exit check (hard):** inject a positive crossmatch and see, within seconds, the failed link, the local repair proposal, approval by a person (or escalation), and the decision memory explaining it. If this doesn't work by 23:00, Day 4 morning goes to it and all stretch work is dropped.

Stretch for anyone ahead: Q21 liver edges and a liver pair in the scenario; Hindi and Tamil on the family page; Q19 bridge pairs on the pool view.

## Day 4, Sun Oct 18: measure, ship, record

| Time | A | B | C | D |
|---|---|---|---|---|
| 09:00–13:00 | Concurrency load test with C; Q20/Q22 if time | Final sim numbers and charts; `benchmarks.md` | Load test harness (3 agents writing, matcher reading) | Simulation lab page with the "match published results" table; polish the demo path only; Diagram Design skill for README architecture and data-model diagrams |
| 14:00–17:00 | README: data model diagram and every query with latency | `data-sources.md` with licences | Deploy: FalkorDB Cloud + backend; env and reset script | Deploy web; record demo video |
| 17:00–21:00 | Fresh-clone setup test from the README | Check every number is labelled synthetic | Re-record or fix | Edit video, submission form, declare Tracks 1 and 2 |
| 21:00–23:59 | **Buffer. Submit by 22:30.** | | | |

## Submission checklist (from the rules)

- [ ] Public repo, README with setup steps
- [ ] Graph data model in README
- [ ] Cypher queries and algorithms used
- [ ] Demo video
- [ ] Live deployment or local setup instructions
- [ ] Tracks declared (1 and 2)
- [ ] "Synthetic data only, no personal data" in README and video
- [ ] Credits: NOTTO portal, KidneyGrid, ASTRA, IKDRC, ISOT SWAP; we are the coordination and failure-handling layer
- [ ] Risks slide: decision support only, virtual crossmatch doesn't replace the lab, would need regulatory review

## Cut list if behind (drop in this order)

1. Surgery planner and medication safety (stretch anyway; their nav items stay as "not in this demo")
2. Integrity flags (Q22)
3. Liver module (Q21)
4. Bridge pairs / fairness panel (Q19, Q20, Q23)
5. Delorme mode (keep Saidman-IN only)
6. Concurrency load test (state it as future work)

Never cut: failure → local repair → approval → decision memory, the committee blocking view, the Cypher panel.

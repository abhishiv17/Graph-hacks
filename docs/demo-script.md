# KindRed demo script (3 minutes)

Scenario seed: `data/scenarios/s0031` (fixed seed, built Day 1), using the cases from the product design: Hyderabad P-0154, Bengaluru P-0211, Kolkata P-0388, Chennai P-0377. All patients synthetic; the "Synthetic demo data. No real patients." footer is on every screen.

| # | Time | Say | Screen | Graph / agent doing it |
|---|---|---|---|---|
| 0 | 0:00–0:15 | "1 in 3 willing family donors in India is turned away. Only 2,098 swaps in 24 years. Matching is solved. Swaps die after the match." | Landing: "A donor who doesn't match can still save a life." | — |
| 1 | 0:15–0:35 | "Four hospitals. None of these families can be matched inside their own hospital." | Hospital tabs, each private view showing zero loops | Each tenant graph is separate; `find_loops` per hospital returns nothing |
| 2 | 0:35–1:05 | "They join one shared pool. The matching agent finds a 3-way loop across Hyderabad, Bengaluru and Kolkata, and every reason comes from the graph." | **Live pool**: India map, loop drawn; plan #42, optimal; in-focus card S-0076: 46% chance every link holds, 2.0 of 3 expected thanks to its 2-way fallback; Cypher panel open | Q02 edges → Q07 components → Q05 loops → optimiser → Q13 explain; "What the agents are doing" streams each tool call |
| 3 | 1:05–1:25 | "Each hospital's intake agent answers. Lab tests are requested." | **Exchange S-0076**: crossmatch workflow table filling in (Offered ✓, Both teams accept ✓, Lab test requested) | Intake agents apply their policies; `Offer` and `Crossmatch` nodes appear |
| 4 | 1:25–2:05 | "Bengaluru's lab: positive crossmatch on the link to Kolkata. A DQ7 antibody, not typed in advance. Today a coordinator would start phoning. Here the repair is found in about a second." | Link turns red "Failed · lab crossmatch positive (DQ7 antibody)". Panel: "Repair found · Recommended: Chennai P-0377 replaces Kolkata · expected 2.3 of 3 · Fallback kept ready: 2-way Hyderabad ⇄ Bengaluru · found in about 30 ms; the other 31 loops untouched" | Q10 writes `Failure` + `FAILED` edge; Q12 fallback; Q11 searches 2–3 hops around the break; optimiser ranks; Matching agent proposes |
| 5 | 2:05–2:20 | "A person approves. The failure is remembered: that donor is never proposed to that patient again, and DQ-untyped links from this lab now get a lower success estimate. Kolkata goes back to the pool with higher priority." | Click **Approve repair**; Decision memory panel adds the 4 Oct entry | `Decision` with `BASED_ON` + `APPROVED_BY`; Q17 failure priors |
| 6 | 2:20–2:35 | "The legal approval is the slowest step. The loop moves only when every family's file is complete: Bengaluru is missing one relationship proof and Chennai, who just joined, three papers. That is measured against the court's 6–8 week target." | Committee readiness: Hyderabad 5/5, Bengaluru 4/5 · relationship proof, Chennai 2/5 · day 3 of 42 | Q15 across the loop |
| 7 | 2:35–2:50 | "The family in Hyderabad sees only their own case, in their language." | **Your case** P-0154: "One family's test didn't match, so a new family has been found. Your place in the swap is safe." Toggle EN / हिन्दी | Q16; Patient liaison writes from returned facts only |
| 8 | 2:50–3:00 | "Over a simulated year, measured by us: each hospital alone vs shared pool vs KindRed." | **Simulation lab** bars with 95% intervals, plus the "match published results" table filled in | Offline Monte Carlo results |

### Demo patients (1 minute, can open the video)

| Say | Screen | Graph / agent doing it |
|---|---|---|
| "No sign-up. Pick a demo patient: Sunita, kidney, six months of results on file." | **Demo patients** → Sunita | `hosp_hyd` readings, `mem_sunita` memory |
| "A new result arrives. Her eGFR crosses 20. The health watch remembers she was on *Watch*, so this is a change, and it follows its own playbook from the graph." | **Next week**: stage → Prepare; the hand-off list fills in | Q40 → Q42 → Q44; `Task` per step in `exchange` |
| "Each agent picks up its own task: the matching agent finds a swap right away, the scheduler books two appointments, the clerk chases a paper, the liaison messages the family. Nobody pressed approve." | Week 1 in the timeline; **See Sunita's swap on the live map** | Q48; `MatchingAgent.rematch` around P-0901 |
| "Next week the reading falls again but the stage hasn't changed, so no repeat alert. Memory updated." | **Next week** | `Finding {kind: reading}`, `Fact` SUPERSEDES |
| "Weeks 3 to 5: tests pass, the clerk collects the papers, the surgery is booked, the transplant is done." | **Next week** ×3; the five-step tracker fills | `health.progress`: run_lab, documents, `Loop.surgery_at`, `transplanted_at` |
| "Rajesh: nobody fits him. A family joins in Mumbai; the agents' watch sees the pool change and forms his swap." | Rajesh, **Next week** ×2 | `watch_pool` searches again when the waiting pool changes |
| "Reload the page: the greeting comes from memory: what changed since your last look." | Greeting banner | Q47 sessions |

If the live repair misbehaves while recording: reset with `scripts/reset-demo` and replay. Never fake the repair with an animation.

Stretch beats (only if built and stable): Integrity review (two pairs share a phone number and a "facilitator"; sent for human review, nothing blocked); a 2-way liver loop Ahmedabad ⇄ Mumbai with "graft 0.93% and 1.04% of body weight · donors keep 38% and 41%"; "Check a remedy" on the family screen.

Words to avoid: "lives saved", "replaces NOTTO", "AI decides". Words to use: "decision support", "synthetic", "complements NOTTO".

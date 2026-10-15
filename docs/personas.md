# Demo patients: agents that take one patient from a falling lab result to a transplant

No sign-up, no login. A visitor picks a demo patient, sees six months of synthetic history, and presses **Next week**.
The agents take it from there with no approve button: they notice the patient getting worse, find a swap, book
appointments, run the tests, collect the committee papers, book the transplant and record it as done. **See the swap
on the live map** jumps to the map with that swap in focus. Sign-up and login are a later feature; `access.py` is still
the one place a real identity provider would plug in.

**FalkorDB is the only database.** Everything below is graph data.

## The two personas

| | Kidney: Sunita Reddy (P-0901, Hyderabad) | Liver: Rajesh Nair (P-0902, Kochi) |
|---|---|---|
| Situation | CKD stage 4, not on dialysis yet. Husband (group O) wants to donate, but she has antibodies against his B44. cPRA 88 | Cirrhosis. His daughter's graft is too small for him (a clash only liver has), though it would fit a lighter patient |
| Readings on file | eGFR monthly: 26 → 25 → 23 → 22 → 21 → 21 | MELD monthly: 14 → 15 → 16 → 16 → 17 → 18 |
| What "Next week" brings | 19, 18, 17, 16, 15, 14 | 20, 22, 25, 26, 27, 28 |
| Week 1 | Prepare (eGFR ≤ 20). The matching agent finds a 2-way swap at once | Prepare (MELD ≥ 19). Nobody in the pool fits him yet; the agent says so |
| Week 2 | The crossmatch coordinator runs the lab tests: all pass | A new family joins the pool in Mumbai. The watch notices the pool changed and the matching agent forms a swap |
| Then | Papers collected, surgery booked, transplant done in week 5 | Work-ups pass, papers collected, transplant done in week 6 |

Thresholds are program configuration (`data/params/personas.yaml`), each with its source:

- Kidney: eGFR ≤ 20, pre-emptive listing window (OPTN Policy 8); eGFR < 15, kidney failure, CKD stage G5 (KDIGO 2012);
  a decline of more than 5 per year is rapid progression (KDIGO 2012).
- Liver: MELD ≥ 15, transplant benefit (Merion et al. 2005); MELD ≥ 25 urgent, recertified every 7 days; 19–24 every
  30 days (OPTN Policy 9).

Both personas join the pool after this week's plan, and their profiles were chosen so the scripted kidney and liver
stories (S-0076, L-0034) repair exactly as before (tests/test_demo_flow.py, tests/test_liver_flow.py).

## Where things live (tenancy)

| Graph | What the personas add |
|---|---|
| `hosp_hyd`, `hosp_cok` (private) | `LabResult` and `Appointment` nodes on the hospital's `Pair`. Clinical history never enters the shared graph |
| `exchange` (shared) | The pair (matched like any other), `Pair.urgent`, the swap `Loop` with `surgery_at` and `transplanted_at`, `Task` hand-offs, `Decision`, `Event` |
| `mem_sunita`, `mem_rajesh` (one per persona) | The agents' memory of this person: `Session`, `Finding`, `Fact` (with `SUPERSEDES`), `Playbook`/`Step`, `Handoff` |

### Memory kinds (Track 2)

- **Episodic:** a `Finding` for every reading assessed and every step of the case, with the readings it rests on and the hand-offs it started.
- **Semantic:** `Fact` nodes for what's true now (stage, trend, projection, the swap). A new fact `SUPERSEDES` the old one, which is kept with its date.
- **Procedural:** `Playbook {stage}` with ordered `Step {agent, action, why}` nodes. The health watch reads its own playbook from the graph.
- **Across sessions:** opening the page starts a `Session`; the greeting says what changed since the previous visit.

## The agents (Tracks 1 and 2)

Each simulated week (`health.advance`):

1. **Arrivals.** New families may join the pool (`arrivals` in the YAML); the intake agent adds them like any family.
2. **The case moves one step, on its own** (`health.progress`):
   - no swap yet and marked urgent → the matching agent searches again whenever the pool has changed (the background watch does this too, every sweep);
   - swap offered → the crossmatch coordinator runs the tests (lab crossmatch, or the donor work-up for liver);
   - tests passed → the committee clerk asks for missing papers, the hospitals answer within the week, the file is filed (synthetic approval) and the scheduler books the surgery, the same day for every family;
   - surgery date reached → the transplant is recorded as done and the journey ends.
3. **A new reading.** The health watch compares the trend with the thresholds and with the stage it remembers. Only a more urgent stage triggers the stage's playbook; the same stage again means no repeat alert. Once the transplant is booked there is nothing new to hand out.
4. **Hand-offs.** One `Task` per playbook step, `ASSIGNED_TO` the matching agent (mark urgent, search 2-way then 3-way, form the swap), the scheduler (book appointments), the committee clerk (chase papers) or the patient liaison (message the family). Each agent picks up its own open tasks (`run_handoffs`), from the API and from the background watch.

Nobody approves a step. People see every step (the journey, the audit trail, the decisions with what they were based on),
and **Replay** undoes the swap and the arrival and restarts the journey from the six months on file.

## Ask KindRed

`patient_memory` is one of Ask KindRed's read-only tools: "What do the agents remember about P-0901?" returns the
current beliefs with what each replaced, dated findings and open hand-offs. Ask KindRed runs on Groq, Claude or a local
Ollama model (`KINDRED_ASK_PROVIDER`).

## API

- `GET /api/personas` – the demo patients, with stage, last reading and their swap.
- `GET /api/personas/{id}` – journey: readings, thresholds, findings, facts, playbook, hand-offs, appointments, the swap, queries run.
- `POST /api/personas/{id}/session` – start a session; returns the "since last time" greeting.
- `POST /api/personas/{id}/advance` – one simulated week (409 once the transplant is done).
- `POST /api/personas/{id}/reset` – replay the journey.

## Screens

- `/patients` – pick a demo patient (first item in the sidebar, linked from the homepage).
- `/patients/{id}` – where the case stands (five steps), **See the swap on the live map**, the trend chart, what the agents did week by week, and "Under the hood" (memory, playbook, appointments, graphs and queries).
- `/pool?patient={id}` – the live map with that patient's swap in focus and a link back.

## Not in scope for the hackathon

Sign-up/login, real EHR import, more than two personas, an LLM in the health watch (it's rules over graph data on purpose).

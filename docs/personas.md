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
| Week 1 | Prepare (eGFR ≤ 20). The coordinator's 2-way search finds swaps; it forms one | Prepare (MELD ≥ 19). Both searches find nothing; it waits |
| Week 2 | It runs the lab tests: all pass | A family joins in Mumbai. 2-way search: 0; 3-way search: found. It forms the 3-way swap |
| Then | Surgery booked, transplant done in week 4 | Work-ups pass, papers requested and received, surgery booked, transplant done in week 6 |

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

## The week, step by step (Tracks 1 and 2)

Each simulated week (`health.advance`):

1. **The world** (not an agent, and labelled "Hospitals" on the page): scripted families join the pool (`arrivals` in
   the YAML), hospitals send the papers the clerk asked for a week earlier, and a booked surgery happens on its date.
2. **The health watch** reads the new result, compares the trend with the thresholds and with the stage it remembers.
   Only a more urgent stage triggers the stage's playbook (read from the graph), handing one `Task` each to the
   scheduler, committee clerk and patient liaison. Each agent picks up its own open tasks.
3. **The coordinator agent** (`agents/coordinator.py`) chooses this week's step for the case. It is a language model
   (Groq `openai/gpt-oss-120b` by default) given the patient's state from the graph, including what the agents
   remembered, and a fixed catalogue of six tools:

   | Tool | What it does (each checks its preconditions against the graph) |
   |---|---|
   | `find_swaps(max_size)` | Searches 2-way (shallow) or 2-and-3-way (deep) loops through the patient; every search is stored as a `Search` node |
   | `form_swap(reason)` | Forms the best swap and sends offers, only after a search found one |
   | `run_tests(loop_id, reason)` | Runs the pre-surgery tests (crossmatch or donor work-up) |
   | `request_papers(loop_id, reason)` | Asks the hospitals for missing committee papers |
   | `book_surgery(loop_id, reason)` | Files the committee case and books surgery, same day for every family |
   | `wait(reason)` | Nothing this week |

   One action per week (a second one is refused). Every id the model's reason names must appear in what the action
   returned, or the reason is replaced by the result. If the model fails, or waits while the rules say a step is due,
   the rules run the same tools and the trace says "Safety net". The decision is a `Finding` with the full tool trace
   in the patient's memory and a `Decision` in the exchange graph. The same tools are on the MCP server (`patient_*`).

Between weeks, the background watch (every 30 s) runs the coordinator again if the pool changed while an urgent patient
waits. **Replay** undoes the swap and the arrival and restarts the journey; the conversation about the patient is kept.

### Shallow vs deep search

Rajesh in week 2: the 2-way search finds nothing; the 3-way search finds Kochi → Bengaluru → Mumbai, a loop that only
exists because the Mumbai family joined. The page shows both counts and replays the search on a small map.

### Asking about a patient

The patient page has its own Ask KindRed chat. Questions are framed around the patient (the model reaches for
`patient_memory`), and both turns are stored as `Message` nodes in the patient's memory graph, so any browser sees the
same conversation and "where you left off".

## API

- `GET /api/personas` – the demo patients, with stage, last reading and their swap.
- `GET /api/personas/{id}` – journey: readings, thresholds, findings, facts, playbook, hand-offs, appointments, the swap, queries run.
- `POST /api/personas/{id}/session` – start a session; returns the "since last time" greeting.
- `POST /api/personas/{id}/advance` – one simulated week (409 once the transplant is done).
- `POST /api/personas/{id}/reset` – replay the journey.
- `GET|POST /api/personas/{id}/chat` – the conversation about the patient (stored in their memory graph).

## Screens

- `/patients` – pick a demo patient (first item in the sidebar, linked from the homepage).
- `/patients/{id}` – where the case stands (five steps) with this week's coordinator decision and "How it decided", **See the swap on the live map**, "Why this swap" (a small map, each donation's reasons and chance, shallow vs deep search with a replay), "Ask about the patient", the trend chart, and month chips that open each month's weekly breakdown.
- `/pool?patient={id}` – the live map with that patient's swap in focus and a link back.

## Not in scope for the hackathon

Sign-up/login, real EHR import, more than two personas, an LLM in the health watch (it's rules over graph data on purpose).

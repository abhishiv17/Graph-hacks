# How KindRed works (for reviewers)

The platform-level detail that used to live on the "How it works" screen. The screen still opens at `/graph` (live
graph counts and query timings); it is just no longer in the menu.

## FalkorDB is the only database

| Graph | Holds |
|---|---|
| `exchange` | The shared pool: de-identified pairs, `CAN_GIVE_TO` links with their reasons, swaps (`Loop`), offers, tests, failures, decisions, events, and the agents' hand-off `Task`s |
| `hosp_<city>` | One private graph per hospital: names, full HLA typing, documents, and the demo patients' lab results and appointments |
| `mem_sunita`, `mem_rajesh` | One memory graph per demo patient: sessions, findings, beliefs (`Fact` with `SUPERSEDES`), playbooks, swap searches |
| `chat_sunita`, `chat_rajesh` | The ongoing conversation about each patient; never deleted by Replay or Restart demo |

Every query is a named file in `backend/queries/` (Q00–Q59). Read-only ones run through `GRAPH.RO_QUERY`, so FalkorDB
itself refuses a write from them.

## Track 1: agents that act on connected data

| Focus point | Where |
|---|---|
| Multi-hop reasoning | 2- and 3-way swaps are loops over `CAN_GIVE_TO` (Q04, Q05); repair searches 2 hops around a failure (Q11); withdrawal impact, reach within N hops and shortest path (Q32–Q34) |
| Graph algorithms as tools | `algo.WCC` splits the pool (Q07), `algo.betweenness` finds bridge families (Q19), `algo.pageRank` ranks how easy each waiting family is to place in a swap, so the hardest to match can go first (`match_ease`, Q59), `shortestPath` (Q34) |
| Tool selection through MCP | The coordinator agent is a real MCP client (`agents/mcp_client.py`): each week it lists its tools from KindRed's own MCP server (`list_tools`) and calls them over the protocol (`call_tool`). The server keeps the week's session, so it enforces one action per week whichever client calls. Ask KindRed picks from its own fixed catalogue, also served over MCP |
| Actions from the graph | Swaps formed, tests run, papers requested, surgery booked (coordinator); offers, holds, failures, repairs (exchange agents) |
| Explainable results | "Why this swap" reads each link's stored reasons (Q13); every coordinator week keeps its tool trace; Ask KindRed answers carry their paths and every id is checked |

## Track 2: agent memory and coordination

| Focus point | Where |
|---|---|
| Episodic | Weekly `Finding`s (lab results, visits, checks, decisions with traces), `Failure` nodes, `FAILED` edges |
| Semantic | `Fact`s that supersede older ones; failure priors per lab (Q17) |
| Procedural | `Playbook`/`Step` nodes per stage, read by the health watch (Q44) |
| Persistent conversation | Each patient's chat (`chat_<id>`, Q52–Q53) and Ask KindRed's remembered answers (Q37–Q39). An answer that rests on memory says so, with the date each piece was learned and which agent learned it ("Answered from memory" under the answer, in Kin, the patient chat and Ask KindRed) |
| Shared state and hand-offs | Agents coordinate only through `Task` nodes in the exchange graph (Q48) |
| Agents read each other's memory | Every step lists what it read first and who wrote it (`agents/recall.py`): the coordinator reads the health watch's beliefs and findings and the crossmatch coordinator's failed links; the matching agent reads the failure memory before it searches (Q54); the scheduler, clerk and liaison pick up the health watch's tasks. Shown as "Read before acting" on each patient's page and on swap timelines |
| High-concurrency reads and writes | Optimistic `version` check on every family write (Q01). Measured with `python -m swapnet.sim.concurrency`: up to 16 agents publishing or updating at once while the matcher searches, and up to 16 agents updating one family at the same moment; no write lost (README, "Concurrency test"). And through the whole API with Artillery (`loadtest/`): many visitors reading and writing at once in a private copy, then a count in the graph that every write landed exactly once, and 20 people pressing Next week on one patient in the same second, of whom exactly one moves it (README, "Load test") |
| Per user / tenant | One graph per hospital; one memory graph per patient; and a **private copy of the whole demo per visitor** (`swapnet/worlds.py`): its own graphs with the copy's id as a prefix, so two judges never move the same journey |

See docs/personas.md for the demo patients' week, docs/agents-and-tools.md for every agent and tool, and
docs/queries.md for every query.

## The reasoning layer: "Explain this graph"

Every family graph and every swap has an **Explain this graph, step by step** button. `swapnet/reasoning.py` builds the
walkthrough from graph data only: who the family is, why their own donor can't give (the coral path), who the graph
tried and why each one failed (Q58: blood group, antibodies against the donor's tissue type, a remembered failed test,
the liver size rule, or a family already in another swap), the 2-way and 3-way swaps found, and what the agents chose.
Each step names the nodes and links to highlight. The same reasons appear when you hover over a circle or a line.

Sarvam (sarvam.ai) translates the finished sentences into 10 Indian languages and reads them aloud (`swapnet/voice.py`,
`SARVAM_API_KEY`). The key stays on the server; audio and translations are cached. No language model writes the steps.

## Two people at once

- **Private copies.** The top bar's "make my own copy" builds the whole demo again in the visitor's own FalkorDB graphs
  (`<id>__exchange`, `<id>__hosp_hyd`, `<id>__mem_sunita`, `<id>__chat_sunita`, ...). The id travels as the
  `X-KindRed-World` header; a context variable routes every query to that copy's graphs (`db.real`). Copies expire after
  6 hours unused (`KINDRED_WORLD_TTL`), at most 20 at once (`KINDRED_MAX_WORLDS`). The background watch works in every
  live copy.
- **On the shared demo**, "Next week" sends the week the page shows. If the journey has moved on (someone else pressed
  it), or another advance is running, the request is refused with a plain message instead of moving the patient twice.

## Language models on demo day

Groq's free key allows a few thousand tokens a minute per model. When one model is rate limited, KindRed moves to the
next one (`KINDRED_GROQ_FALLBACK`, default `openai/gpt-oss-20b`), which has its own quota; if every model is busy the
coordinator's rules run that week's step and say so. For a live demo with many visitors, use a paid Groq key or set
`KINDRED_ASK_PROVIDER=anthropic` with `ANTHROPIC_API_KEY`.

## Seeing the agents work: the Agents page

The agents run on their own: the background watch sweeps every 30 seconds, in the shared demo and every private copy,
and the coordinator agent and health watch act each simulated week. `/agents` shows this as a graph built from FalkorDB
on every refresh (`swapnet/agents/network.py`, `GET /api/agents/graph`): `Agent` nodes, `Decision -[:MADE_BY]-> Agent`
with what each decision read first and who wrote it, `Task -[:ASSIGNED_TO]-> Agent`, the `Event` feed, Ask KindRed's
`Question` nodes and the findings in each patient's memory graph. Agents sit around the four kinds of graph they share
(the pool, the hospital graphs, each patient's memory); every line is a write, a read or a hand-off through a `Task`
node, and none joins two agents directly. New actions play on the graph one at a time as they arrive. Nothing on the
page triggers the agents; it only shows what they already did.

## Kin talks about the patient you're looking at

On a patient's or family's page, Kin's box becomes "Ask about <them>": the same conversation as the page's own chat,
kept in that patient's chat graph. A new chat starts with three questions answered from graph data, without a model
(`swapnet/chat.py`). A question that names a family outside the patient's own swap is turned away before any model is
asked.

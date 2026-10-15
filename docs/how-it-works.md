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

Every query is a named file in `backend/queries/` (Q00–Q53). Read-only ones run through `GRAPH.RO_QUERY`, so FalkorDB
itself refuses a write from them.

## Track 1: agents that act on connected data

| Focus point | Where |
|---|---|
| Multi-hop reasoning | 2- and 3-way swaps are loops over `CAN_GIVE_TO` (Q04, Q05); repair searches 2 hops around a failure (Q11); withdrawal impact, reach within N hops and shortest path (Q32–Q34) |
| Graph algorithms as tools | `algo.WCC` splits the pool (Q07), `algo.betweenness` finds bridge families (Q19), `shortestPath` (Q34) |
| Tool selection through MCP | The coordinator agent (`agents/coordinator.py`) and Ask KindRed (`agents/ask.py`) pick from fixed tool catalogues; both catalogues are served by the MCP server (`python -m swapnet.mcp.server`, 35 tools) |
| Actions from the graph | Swaps formed, tests run, papers requested, surgery booked (coordinator); offers, holds, failures, repairs (exchange agents) |
| Explainable results | "Why this swap" reads each link's stored reasons (Q13); every coordinator week keeps its tool trace; Ask KindRed answers carry their paths and every id is checked |

## Track 2: agent memory and coordination

| Focus point | Where |
|---|---|
| Episodic | Weekly `Finding`s (lab results, visits, checks, decisions with traces), `Failure` nodes, `FAILED` edges |
| Semantic | `Fact`s that supersede older ones; failure priors per lab (Q17) |
| Procedural | `Playbook`/`Step` nodes per stage, read by the health watch (Q44) |
| Persistent conversation | Each patient's chat (`chat_<id>`, Q52–Q53) and Ask KindRed's remembered answers (Q37–Q39) |
| Shared state and hand-offs | Agents coordinate only through `Task` nodes in the exchange graph (Q48) |
| Per user / tenant | One graph per hospital; one memory graph per patient |

See docs/personas.md for the demo patients' week, docs/agents-and-tools.md for every agent and tool, and
docs/queries.md for every query.

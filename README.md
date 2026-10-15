# KindRed

Kidney paired-exchange (swap) coordination for India, built on FalkorDB for Graph Hacks 2026 (Tracks 1 and 2).

**Synthetic demo data only. No real patients.**

The graph finds the swap loops, a CP-SAT optimiser picks among them, agents send offers and lab tests, and when a lab test fails the graph repairs the loop locally (2 hops around the released families). A person approves every repair. The LLM never allocates anything.

## Run it on your laptop

Everything runs locally. There are no accounts to create and no API keys to set, and all data is generated.

### What you need

| | Version | Notes |
|---|---|---|
| [Docker Desktop](https://www.docker.com/products/docker-desktop/) | any recent | On Windows it needs WSL 2 (the installer offers it). Give Docker at least 4 GB of RAM. |
| Git | any | Or download the repo as a ZIP. |
| Free ports | 3000, 3001, 6379, 8000 | FalkorDB browser, web app, FalkorDB, API |

You only need Python and Node if you want to change the code (option B below).

### Option A: everything in Docker (recommended)

```bash
git clone <this repo> kindred
cd kindred
docker compose up --build -d
```

The first build takes about 3–5 minutes (it downloads FalkorDB, Python and Node images). After that:

1. Open **http://localhost:3001**. That's the homepage.
2. Click into the workspace, or go straight to **http://localhost:3001/pool**.
3. Press **Reset pool**. It generates 153 synthetic pairs across 11 hospitals and runs the first match. Then follow the demo story below.

Useful extras:

- **http://localhost:3000**: the FalkorDB browser. Pick the `exchange` graph to see the shared pool, or `hosp_hyd`, `hosp_blr`, … for a hospital's private graph.
- **http://localhost:8000/docs**: the API, if you want to call it directly.
- Reset the demo at any time with **Reset pool**, or run `curl -X POST http://localhost:8000/api/demo/reset`.
- See logs with `docker compose logs -f backend`, and stop everything with `docker compose down`.

If the API isn't reachable, the web app falls back to a recorded synthetic snapshot and says so in the top bar. So if you see "offline snapshot", check `docker compose ps`.

### Option B: develop locally (hot reload)

You need **Python 3.11+** and **Node 22+**. FalkorDB always runs in Docker.

```bash
docker compose up -d falkordb
```

Backend, macOS / Linux:

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
uvicorn swapnet.api.main:app --reload --port 8000
```

Backend, Windows PowerShell:

```powershell
cd backend
python -m venv .venv; .\.venv\Scripts\Activate.ps1
pip install -e ".[dev]"
uvicorn swapnet.api.main:app --reload --port 8000
```

Web, in a second terminal:

```bash
cd web
npm install
npm run dev          # http://localhost:3001
```

On Windows, `.\scripts\dev.ps1` starts all three in separate windows.

> **Windows "An Application Control policy has blocked this file"**: Smart App Control can block the pandas DLL that OR-Tools pulls in. Run the backend in Docker and only the web app locally: `docker compose up -d falkordb backend`, then `cd web && npm run dev`.

### Optional settings

Copy `.env.example` to `.env`. `ANTHROPIC_API_KEY` is only used to translate family messages into languages other than English and Hindi. Everything else works without it. If the API runs somewhere other than `localhost:8000`, set `NEXT_PUBLIC_API_URL` before building the web app.

### Tests, simulation and MCP

| What | Docker | Local (venv active, in `backend/`) |
|---|---|---|
| Tests (needs FalkorDB; resets the demo graph) | `docker compose exec backend sh -c "pip install -q pytest && pytest -q"` | `pytest -q` |
| Simulation lab, 20 runs, about 4–5 min | `docker compose run --rm backend python -m swapnet.sim.lab --runs 20` | `python -m swapnet.sim.lab --runs 20` |
| MCP server (18 tools, stdio) | `docker compose exec backend python -m swapnet.mcp.server` | `python -m swapnet.mcp.server` |

The simulation writes `data/generated/sim_results.json`. The Simulation screen reads it from the API, so refresh the page after a run.

### Troubleshooting

- **Port already in use**: something else is on 3000, 3001, 6379 or 8000. Stop it, or change the left-hand port in `docker-compose.yml`.
- **The workspace shows "offline snapshot"**: the API isn't up yet. Wait 10 seconds after `docker compose up`, then check `docker compose logs backend`.
- **The demo state looks odd after testing**: press **Reset pool** (or run `scripts/reset-demo`). Running the tests also resets the graph.
- **Code changes don't show up in Docker**: rebuild with `docker compose up --build -d`.

## Simulation results (synthetic, measured by us)

We simulate one year of a national pool, day by day: about 540 families arrive, lab results take 9 days (offer plus crossmatch, as in multi-centre programmes, Ashlagi 2018), and match runs are weekly. Each policy ran 20 times. Ranges are 95% intervals.

| Policy | Transplants / year | Lab tests wasted on loops that broke | Median wait to a match that held |
|---|---|---|---|
| Each hospital alone, 2-way only (today) | 142 (135–148) | 43 | 3.1 weeks |
| Shared pool, 2-way only | 223 (216–230) | 76 | 3.5 weeks |
| Shared, 3-way, ignores failures | 249 (241–257) | 152 | 3.8 weeks |
| **KindRed**: shared, 3-way, plans for failure, repairs live | **250 (242–258)** | **130** | **3.1 weeks** |

What this does and doesn't show:

- A shared pool is the big win: **76% more transplants** than each hospital working alone.
- Compared with a 3-way matcher that ignores failures, KindRed gets the same number of transplants (the intervals overlap), with **14% fewer wasted lab tests**, matches that hold **about 0.7 weeks sooner**, and about 25 broken loops repaired a year.
- KindRed matches fewer highly sensitised patients than the failure-blind matcher (39% vs 43%), because their links fail more often. It's a known trade-off of failure-aware matching, and we haven't solved it yet.
- The generator reproduces Saidman et al. 2006: 46.6% matched with 2-way loops (published 49.8%) and 57.7% with 2+3-way (published 59.8%), at n = 100.

## The screens

| Screen | What it's for |
|---|---|
| **Live pool** (`/pool`) | A zoomable map of India with every planned donation as a line. Click any line to see who gives to whom, how likely it is to hold, and the reasons stored on its graph edge. Click a hospital to see only its families. |
| **Swaps** (`/swaps`, `/swaps/S-0076`) | Each swap's graph, offers, lab tests, failure, repair proposal and committee papers. **Run lab tests** and **Approve repair** live here. |
| **Committee papers** (`/committee`) | Which family's paperwork is holding up each swap, against the 42-day court target. |
| **Family view** (`/case/P-0154`) | What one family sees on their phone, in English or Hindi. Only their own case. |
| **Guided replay** (`/lab`) | The failure-and-repair story in slow motion, for explaining it. Changes nothing. |
| **Impact** (`/impact`) | The yearly simulation: four policies, 20 runs, with the validation against Saidman 2006. |
| **How it works** (`/graph`) | What's in FalkorDB right now, every named query with live timings, the 18 MCP tools, and how each Track 1/2 point is met (with honest status). |
| **Audit trail** (`/audit`) | Every agent action and human decision, in order. |

A **demo guide** at the top of every screen shows the five story steps and offers the next one as a button, and every screen opens with a short "what is this" note. Dotted words have a plain-language definition on hover.

## Demo story (about 3 minutes)

1. **Live pool**: 153 synthetic pairs across 11 hospitals; this week's plan includes swap S-0076, Hyderabad → Bengaluru → Kolkata (46% chance every link holds, 2.0 of 3 expected thanks to its 2-way fallback). Zoom in and click its lines.
2. **Add a new family (Chennai)**: the intake agent checks the rules and adds the family's links to the graph.
3. Open S-0076 and press **Run lab tests**. Hyderabad → Bengaluru is negative; Bengaluru → Kolkata is positive (DQ7, never typed). The link is stored as a FAILED edge and never proposed again.
4. The repair panel shows Hyderabad → Bengaluru → Chennai, found in milliseconds without touching the other 27 loops, with the 2-way fallback and alternatives. **Approve recommended repair**; the negative test carries over.
5. **Family view** (P-0154, English or Hindi), **Committee papers** (the repaired swap waits on Bengaluru's relationship proof and Chennai's three missing papers), **Impact**, **How it works**.

## Layout

- `backend/queries/` – every Cypher query, named Q00–Q24. Each screen shows which ones ran and how long they took.
- `backend/swapnet` is the Python package (the project's working name was SwapNet).
- `backend/swapnet/graph` – FalkorDB access, publishing from private hospital graphs to the shared exchange graph, and a log of every query for the How it works screen.
- `backend/swapnet/agents` – intake, crossmatch coordinator, matching, committee clerk, family messages.
- `backend/swapnet/optimiser` – CP-SAT on expected transplants (accounts for test failures and fallbacks).
- `backend/swapnet/sim` – day-by-day yearly simulation of 4 policies, validated against Saidman et al. 2006.
- `data/` – published parameters (ABO, cPRA bands, failure rates), hospitals, intake policies, the demo scenario. `data/geo/` – India map data (Natural Earth, India's point of view).
- `web/` – Next.js app. `docs/` – schema, queries, agents, build plan, demo script.
- `scripts/capture-snapshot.py` re-records the offline demo after API changes; `scripts/build-india-map.py` regenerates the map paths.

## Data model (short)

One private graph per hospital (`hosp_HYD`, …) holds names, full HLA typing, relationships and documents. The shared `exchange` graph holds only what matching needs: `Pair`, `Donor`, `Patient`, `HLAAntigen`, `Antibody`, `CAN_GIVE_TO {p_success, reasons}`, `Loop`, `IN_LOOP`, `FAILED`, `Failure`, `Decision`, `Task`, `Event`. See docs/schema.md.

## Rules we follow

Indian law: swaps only between near-relative pairs, each needing Authorisation Committee approval, no altruistic chains. These are checked before a pair is published.

## Credits

Built alongside, not instead of, KidneyGrid, the NOTTO portal, ASTRA, IKDRC and ISOT SWAP. KindRed is the coordination and failure-handling layer.

"use client";
import { useState } from "react";
import { PageIntro, Term } from "@/components/app/Help";
import { ErrorState, Loading, Section, Tag } from "@/components/app/ui";
import { useQueries } from "@/lib/data/hooks";
import { useResource } from "@/lib/data/source";
import { fmtTime } from "@/lib/data/derive";
import type { GraphOverview } from "@/lib/data/types";

type Status = "Built" | "Partly" | "Not yet";
const RUBRIC: { track: string; items: { point: string; how: string; evidence: string[]; status: Status }[] }[] = [
  { track: "Track 1 · Agents that act on connected data", items: [
    { point: "Multi-hop reasoning", status: "Built",
      how: "The virtual crossmatch walks donor → tissue type ← antibody ← patient (3 hops) before any lab test. A swap loop is a 2- or 3-hop cycle of donations. A repair searches only within 2 hops of the families a failure released.",
      evidence: ["Q02_build_edges_for_pair", "Q03_virtual_crossmatch", "Q05_three_way_loops", "Q11_local_repair_candidates"] },
    { point: "Graph queries and algorithms as agent tools", status: "Built",
      how: "FalkorDB's algo.WCC splits the pool into independent parts before matching; algo.betweenness finds bridge families whose withdrawal would break the most loops. Loop search is Cypher. Each is wrapped as a tool.",
      evidence: ["Q07_components", "Q19_bridge_pairs", "Q04_two_way_loops"] },
    { point: "Tool selection through MCP", status: "Partly",
      how: "An MCP server exposes 18 tools (find_loops, components, local_repair, explain, …) that any MCP client, such as Claude, can choose from. The in-app agents call the same functions directly; an LLM agent choosing tools live in the UI is not built yet.",
      evidence: [] },
    { point: "Actions based on what the graph shows", status: "Built",
      how: "Agents send offers, request lab tests, record a failure as a FAILED edge, propose a repair, and chase committee papers, each triggered by graph state.",
      evidence: ["Q09_offer_loop", "Q10_record_failure", "Q15_loop_committee_readiness"] },
    { point: "Explainable results", status: "Built",
      how: "Every compatibility edge stores its reasons. Every agent decision is a Decision node linked BASED_ON the facts it used and APPROVED_BY a person. Every screen lists the Cypher that produced it.",
      evidence: ["Q13_explain_loop", "Q14_decision_trail"] },
  ] },
  { track: "Track 2 · Agent memory and coordination", items: [
    { point: "Episodic memory", status: "Built",
      how: "Offers, lab results, failures and events are timestamped nodes. A failed donation becomes a FAILED edge, so it is never proposed again.",
      evidence: ["Q10_record_failure", "Q18_events_since"] },
    { point: "Semantic memory", status: "Built",
      how: "Medical rules are graph data: blood-group compatibility edges, antibodies that react with tissue types. Past failures update each lab's success estimate.",
      evidence: ["Q02_build_edges_for_pair", "Q17_failure_priors"] },
    { point: "Procedural memory", status: "Partly",
      how: "Hospital intake policies and repair playbooks exist as editable data, but in YAML files, not yet as nodes in the graph.",
      evidence: [] },
    { point: "Persistent conversation history", status: "Not yet",
      how: "No chat with agents yet, so nothing to persist. Planned: a coordinator can ask the graph questions, with each conversation stored per hospital.",
      evidence: [] },
    { point: "Shared state and handoffs between agents", status: "Built",
      how: "Agents never call each other. They read and write the same graph: Task nodes are assigned to agents, and the next agent picks up from the state it finds.",
      evidence: ["Q09_offer_loop", "Q15_loop_committee_readiness"] },
    { point: "High-concurrency reads and writes", status: "Partly",
      how: "Every write to a family checks a version number (optimistic locking), so two agents can't overwrite each other. A load test with many hospital agents writing at once is not done yet.",
      evidence: ["Q01_upsert_pair"] },
    { point: "Separate memory per user or tenant", status: "Built",
      how: "Each hospital has its own private graph with names and documents; only de-identified medical facts are published to the shared exchange graph.",
      evidence: [] },
  ] },
];

export default function HowItWorks() {
  const ov = useResource<GraphOverview>("graph-overview", (a) => a.graphOverview(), 4000);
  const g = ov.data;
  const runs = new Map((g?.queries ?? []).map((q) => [q.name, q]));
  return (
    <div>
      <h1 className="font-display text-[2.1rem] leading-none mb-4" style={{ color: "var(--ink-strong)" }}>How it works</h1>
      <PageIntro id="graph"
        what={<>KindRed is built on <strong>FalkorDB</strong>, a graph database. A kidney swap is a graph problem: families are nodes, possible donations are edges, and a swap is a cycle. Lab results, failures, decisions and tasks live in the same <Term k="graph">graph</Term>, so every agent works from one shared, explainable picture. Without the graph there is no matching, no repair and no memory.</>}
        steps={[
          <>The model: what kinds of nodes and connections the graph holds.</>,
          <>What&rsquo;s in FalkorDB right now, per graph, updated live.</>,
          <>How each Track 1 and Track 2 point is met, with the queries that prove it.</>,
        ]} />

      <div className="space-y-10">
        <Section title="The graph model" description="Shared exchange graph. Each hospital also has its own private graph with names and documents.">
          <div className="panel p-4 overflow-x-auto"><SchemaDiagram /></div>
        </Section>

        <Section title="Live in FalkorDB now" description="One shared graph plus one private graph per hospital. Counts refresh every few seconds.">
          {ov.error && !g ? <ErrorState error={ov.error} onRetry={ov.reload} what="the graph overview" /> : !g ? <Loading rows={3} /> : (
            <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
              {g.graphs.filter((x) => x.name === "exchange").map((x) => (
                <div key={x.name} className="panel p-5">
                  <p className="flex items-baseline justify-between"><span className="font-semibold" style={{ color: "var(--ink-strong)" }}><code>{x.name}</code> · shared pool</span><span className="text-sm muted tnum">{x.node_total.toLocaleString()} nodes · {x.rel_total.toLocaleString()} relationships</span></p>
                  <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
                    <ul>{x.nodes.map((n) => <li key={n.label} className="flex justify-between"><span>{n.label}</span><span className="tnum muted">{n.n}</span></li>)}</ul>
                    <ul>{x.relationships.map((r) => <li key={r.type} className="flex justify-between gap-2"><code className="text-xs">{r.type}</code><span className="tnum muted">{r.n}</span></li>)}</ul>
                  </div>
                </div>
              ))}
              <div className="panel p-5">
                <p className="font-semibold" style={{ color: "var(--ink-strong)" }}>Private hospital graphs · <Term k="tenant">one per hospital</Term></p>
                <ul className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
                  {g.graphs.filter((x) => x.name !== "exchange").map((x) => (
                    <li key={x.name} className="flex justify-between"><code className="text-xs">{x.name}</code><span className="tnum muted">{x.node_total} nodes</span></li>
                  ))}
                </ul>
                <p className="mt-3 text-xs muted">Names, phone numbers, documents and approval stages never leave these graphs.</p>
              </div>
            </div>
          )}
        </Section>

        <Section title="How KindRed meets the hackathon tracks" description="Honest status for every point. Query names link to the timings below.">
          <div className="space-y-6">
            {RUBRIC.map((t) => (
              <div key={t.track}>
                <p className="font-semibold mb-2" style={{ color: "var(--ink-strong)" }}>{t.track}</p>
                <div className="panel divide-y" style={{ borderColor: "var(--line)" }}>
                  {t.items.map((it) => (
                    <div key={it.point} className="px-4 py-3 grid gap-2 md:grid-cols-[14rem_1fr_auto] md:items-start">
                      <p className="font-semibold text-sm" style={{ color: "var(--ink-strong)" }}>{it.point}</p>
                      <div className="text-sm">
                        <p>{it.how}</p>
                        {it.evidence.length > 0 && (
                          <p className="mt-1.5 flex flex-wrap gap-1.5">
                            {it.evidence.map((e) => {
                              const q = runs.get(e);
                              return <a key={e} href={`#q-${e}`} className="rounded-full border px-2 py-0.5 text-xs hover:underline" style={{ borderColor: "var(--line)", color: "var(--forest)" }}>{e}{q?.runs ? ` · ran ${q.runs}× · p50 ${q.p50_ms} ms` : ""}</a>;
                            })}
                          </p>
                        )}
                      </div>
                      <Tag tone={it.status === "Built" ? "ok" : it.status === "Partly" ? "warn" : "neutral"}>{it.status}</Tag>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Section>

        {g && <QueryTable g={g} />}

        {g && (
          <div className="grid gap-8 lg:grid-cols-2">
            <Section title={`MCP tools · ${g.tools.length}`} description="What an AI agent connected over MCP can choose to call. Run the server with python -m swapnet.mcp.server.">
              <ul className="panel divide-y text-sm" style={{ borderColor: "var(--line)" }}>
                {g.tools.map((t) => <li key={t.name} className="px-4 py-2"><code style={{ color: "var(--forest)" }}>{t.name}</code> <span className="muted">· {t.about}</span></li>)}
              </ul>
            </Section>
            <Section title="Live query log" description="The most recent named queries against FalkorDB, from any agent or screen.">
              <ul className="panel divide-y text-sm max-h-[520px] overflow-y-auto" style={{ borderColor: "var(--line)" }}>
                {g.recent.map((r, i) => (
                  <li key={i} className="px-4 py-1.5 flex justify-between gap-3">
                    <span className="truncate"><code style={{ color: "var(--forest)" }}>{r.query}</code> <span className="muted text-xs">· {r.graph} · {r.rows} rows</span></span>
                    <span className="tnum muted text-xs shrink-0">{r.ms} ms · {fmtTime(r.at)}</span>
                  </li>
                ))}
                {g.recent.length === 0 && <li className="px-4 py-3 muted">No queries yet. Load the pool to start.</li>}
              </ul>
            </Section>
          </div>
        )}
      </div>
    </div>
  );
}

function QueryTable({ g }: { g: GraphOverview }) {
  const text = useQueries();
  const [open, setOpen] = useState<string | null>(null);
  return (
    <Section title={`Named Cypher queries · ${g.queries.length}`} description="Every query lives in its own file in backend/queries. Click one to read it. Timings are from this running server.">
      <div className="panel overflow-hidden">
        <table className="table">
          <thead><tr><th>Query</th><th>What it does</th><th className="text-right">Runs</th><th className="text-right">p50</th><th className="text-right">p95</th></tr></thead>
          <tbody>
            {g.queries.map((q) => [
              <tr key={q.name} id={`q-${q.name}`} className="cursor-pointer" onClick={() => setOpen(open === q.name ? null : q.name)} aria-expanded={open === q.name}>
                <td><code className="text-xs" style={{ color: "var(--forest)" }}>{q.name}</code></td>
                <td className="text-sm">{q.about}</td>
                <td className="text-right tnum">{q.runs || "–"}</td>
                <td className="text-right tnum">{q.p50_ms != null ? `${q.p50_ms} ms` : "–"}</td>
                <td className="text-right tnum">{q.p95_ms != null ? `${q.p95_ms} ms` : "–"}</td>
              </tr>,
              open === q.name && (
                <tr key={q.name + "-c"}><td colSpan={5} style={{ background: "var(--sage-pale)" }}>
                  <pre className="text-xs overflow-x-auto whitespace-pre" style={{ color: "var(--ink-strong)" }}>{text.data?.[q.name] ?? "Loading…"}</pre>
                </td></tr>
              ),
            ])}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

/** Hand-placed schema of the shared exchange graph. */
function SchemaDiagram() {
  const N: Record<string, [number, number, string]> = {
    Hospital: [90, 60, "city, lat, lon"], Pair: [330, 150, "status, approval, version"], Donor: [140, 250, "blood group, relation"],
    Patient: [330, 330, "blood group, cPRA"], HLAAntigen: [90, 400, "tissue type"], Antibody: [330, 470, "MFI"],
    Loop: [610, 150, "3-way, chance, status"], Failure: [840, 60, "cause, detail"], Crossmatch: [840, 240, "lab result"],
    Offer: [610, 330, "accept / hold"], Decision: [840, 400, "action, rationale"], Agent: [610, 470, "intake, matching…"], Task: [840, 520, "repair to approve"],
  };
  const E: [string, string, string, boolean?][] = [
    ["Pair", "Hospital", "REGISTERED_AT"], ["Pair", "Donor", "HAS_DONOR"], ["Pair", "Patient", "HAS_PATIENT"],
    ["Donor", "HLAAntigen", "HAS_ANTIGEN"], ["Patient", "Antibody", "HAS_ANTIBODY"], ["Antibody", "HLAAntigen", "REACTS_WITH"],
    ["Pair", "Loop", "IN_LOOP"], ["Failure", "Loop", "BROKE"], ["Crossmatch", "Loop", "IN"], ["Offer", "Loop", "FOR"],
    ["Decision", "Loop", "BASED_ON"], ["Decision", "Agent", "MADE_BY"], ["Task", "Agent", "ASSIGNED_TO"],
  ];
  return (
    <svg viewBox="0 0 960 560" className="w-full min-w-[720px] h-auto" role="img"
         aria-label="Graph model: Pair nodes connect to Hospital, Donor and Patient. Donor tissue types and patient antibodies are linked so compatibility is a traversal. Pairs connect to each other with CAN_GIVE_TO and FAILED edges, and to Loops. Failures, crossmatches, offers and decisions point at loops; decisions and tasks point at agents.">
      <defs><marker id="sd-a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#78857d" /></marker></defs>
      {E.map(([a, b, t]) => {
        const [x1, y1] = N[a], [x2, y2] = N[b];
        const dx = x2 - x1, dy = y2 - y1, n = Math.hypot(dx, dy);
        const s = [x1 + (dx / n) * 62, y1 + (dy / n) * 26], f = [x2 - (dx / n) * 66, y2 - (dy / n) * 30];
        return (
          <g key={a + b}>
            <line x1={s[0]} y1={s[1]} x2={f[0]} y2={f[1]} stroke="#b9c4bb" strokeWidth={1.5} markerEnd="url(#sd-a)" />
            <text x={(s[0] + f[0]) / 2} y={(s[1] + f[1]) / 2 - 5} textAnchor="middle" fontSize={10.5} fill="#66736b" style={{ fontFamily: "var(--font-mono, monospace)" }}>{t}</text>
          </g>
        );
      })}
      {/* the central edges: Pair to Pair */}
      <path d="M380,128 C470,40 220,40 290,128" fill="none" stroke="#2c5a4b" strokeWidth={2.5} markerEnd="url(#sd-a)" />
      <text x={335} y={52} textAnchor="middle" fontSize={11.5} fontWeight={700} fill="#183b32" style={{ fontFamily: "var(--font-mono, monospace)" }}>CAN_GIVE_TO {"{chance, reasons}"}</text>
      <text x={335} y={68} textAnchor="middle" fontSize={10.5} fill="#9e4238" style={{ fontFamily: "var(--font-mono, monospace)" }}>FAILED {"{cause}"} · never proposed again</text>
      {Object.entries(N).map(([k, [x, y, sub]]) => (
        <g key={k} transform={`translate(${x} ${y})`}>
          <rect x={-62} y={-24} width={124} height={48} rx={10} fill={k === "Pair" ? "#183b32" : "#ffffff"} stroke={k === "Pair" ? "#183b32" : "#c6d2c7"} />
          <text y={-3} textAnchor="middle" fontSize={13} fontWeight={700} fill={k === "Pair" ? "#ffffff" : "#1f2c27"}>{k}</text>
          <text y={13} textAnchor="middle" fontSize={10} fill={k === "Pair" ? "#a6d8b5" : "#66736b"}>{sub}</text>
        </g>
      ))}
    </svg>
  );
}

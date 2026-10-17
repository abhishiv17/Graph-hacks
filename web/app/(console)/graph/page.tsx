"use client";
import { useState } from "react";
import { PageIntro, Term } from "@/components/app/Help";
import { ErrorState, Loading, Section, Tag } from "@/components/app/ui";
import { useQueries } from "@/lib/data/hooks";
import { useResource } from "@/lib/data/source";
import { fmtTime } from "@/lib/data/derive";
import type { Concurrency, GraphOverview, LoadTest } from "@/lib/data/types";

// The same colours as the family explorer's legend, so the model and the explorer read as one system.
const SCHEMA_TINT: Record<string, string> = { Patient: "#E07A6E", Donor: "#4E8FC4", Hospital: "#7A6FB0", HLAAntigen: "#D99A35", Antibody: "#8E5BB5", Loop: "#2C8A62", Failure: "#D4574B" };
const ms = (x: number | null) => (x == null ? "–" : x < 10 ? x.toFixed(1) : Math.round(x).toString());

/** The measured concurrency test: numbers from data/generated/concurrency.json, never typed in by hand. */
function ConcurrencyTest() {
  const r = useResource<Concurrency>("concurrency", (a) => a.concurrency(), 0);
  const c = r.data;
  if (!c?.ready) return null;
  const errs = [...c.throughput, ...c.reads_under_writes].reduce((n, t) => n + t.errors.write + t.errors.read, 0);
  const th = "px-3 py-2 font-medium";
  const td = "px-3 py-2 tnum";
  return (
    <Section title="Concurrency test (measured)"
      description={<>Many agents writing to the shared exchange graph while the matching agent reads it. FalkorDB {c.falkordb.version} in Docker on one laptop
        ({c.machine.cpus} CPUs), default settings, a scratch graph of {c.base_pool} synthetic kidney families. Rerun with <code>python -m swapnet.sim.concurrency</code>.</>}>
      <div className="grid gap-6 xl:grid-cols-3">
        <div className="panel overflow-x-auto">
          <p className="px-3 pt-3 text-sm font-semibold" style={{ color: "var(--ink-strong)" }}>1 · Hospital agents publishing {c.new_families} new families at once</p>
          <table className="w-full text-sm mt-2">
            <thead><tr className="text-left text-xs muted"><th className={th}>Agents</th><th className={th}>Families/s</th><th className={th}>Each, p50 / p95</th><th className={th}>Lost</th></tr></thead>
            <tbody>
              {c.throughput.map((t) => (
                <tr key={t.writers} className="border-t" style={{ borderColor: "var(--line)" }}>
                  <td className={td}>{t.writers}</td><td className={td}>{t.families_per_s}</td>
                  <td className={td}>{ms(t.publish_latency.p50_ms)} / {ms(t.publish_latency.p95_ms)} ms</td>
                  <td className={td}><Tag tone={t.lost_writes === 0 ? "ok" : "bad"}>{t.lost_writes}</Tag></td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="px-3 py-3 text-xs muted">Each family is two writes: publish (Q01, with the version check), then build its links (Q02). Two matchers search every loop
            in the pool the whole time. Afterwards every family is in the graph once, at version 1.</p>
        </div>
        <div className="panel overflow-x-auto">
          <p className="px-3 pt-3 text-sm font-semibold" style={{ color: "var(--ink-strong)" }}>2 · The matcher&rsquo;s loop search while agents write</p>
          <table className="w-full text-sm mt-2">
            <thead><tr className="text-left text-xs muted"><th className={th}>Agents</th><th className={th}>Updates/s</th><th className={th}>Search p50, no writers → writers</th><th className={th}>p95 with writers</th></tr></thead>
            <tbody>
              {c.reads_under_writes.map((t) => (
                <tr key={t.writers} className="border-t" style={{ borderColor: "var(--line)" }}>
                  <td className={td}>{t.writers}</td><td className={td}>{t.updates_per_s}</td>
                  <td className={td}>{ms(t.search_idle.p50_ms)} → {ms(t.search_during_writes.p50_ms)} ms</td>
                  <td className={td}>{ms(t.search_during_writes.p95_ms)} ms</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="px-3 py-3 text-xs muted">One search is every 2- and 3-way loop in a pool of {c.reads_under_writes[0]?.pool} families (Q04, Q05). The pool&rsquo;s size is fixed
            here: agents update families of their own and rebuild their links, and the same two matchers search with no writers first. The two columns
            differ by about as much as one run differs from the next, so the writes don&rsquo;t measurably slow the search; the pool&rsquo;s size does.</p>
        </div>
        <div className="panel overflow-x-auto">
          <p className="px-3 pt-3 text-sm font-semibold" style={{ color: "var(--ink-strong)" }}>3 · Agents updating the same family at the same moment</p>
          <table className="w-full text-sm mt-2">
            <thead><tr className="text-left text-xs muted"><th className={th}>Agents</th><th className={th}>Updates</th><th className={th}>Stale writes refused</th><th className={th}>Lost with check</th><th className={th}>Lost without</th></tr></thead>
            <tbody>
              {c.contention.map((x) => (
                <tr key={x.agents} className="border-t" style={{ borderColor: "var(--line)" }}>
                  <td className={td}>{x.agents}</td><td className={td}>{x.updates_wanted}</td><td className={td}>{x.conflicts_caught}</td>
                  <td className={td}><Tag tone={x.lost_updates === 0 ? "ok" : "bad"}>{x.lost_updates}</Tag></td>
                  <td className={td}><Tag tone={x.control_without_check.lost_updates === 0 ? "ok" : "warn"}>{x.control_without_check.lost_updates}</Tag></td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="px-3 py-3 text-xs muted">Each agent reads the family&rsquo;s version and writes through Q01 with it. If another agent wrote first, the write is refused and the agent
            reads again and retries. The control does the same work as a plain read-then-write, and loses updates.</p>
        </div>
      </div>
      <p className="mt-3 text-xs muted">FalkorDB runs one write query at a time per graph and reads in parallel, so writes queue instead of interleaving: more agents raise
        throughput only up to a point. {errs === 0 ? "No query timed out or was refused in any run." : `${errs} queries timed out or were refused (counted, not hidden).`} Measured {fmtTime(c.measured_at)}. {c.note}</p>
    </Section>
  );
}

/** The load test through the API: numbers from data/generated/loadtest.json (loadtest/run.mjs, Artillery). */
function LoadTestResults() {
  const r = useResource<LoadTest>("loadtest", (a) => a.loadtest(), 0);
  const t = r.data;
  if (!t?.ready) return null;
  const th = "px-3 py-2 font-medium";
  const td = "px-3 py-2 tnum";
  const errors = Object.values(t.errors).reduce((n, x) => n + x, 0);
  return (
    <Section title="Load test through the API (measured)"
      description={<>Many visitors using the app at once, end to end: HTTP, FastAPI, the agents&rsquo; code and FalkorDB. {t.tool}, {t.phases}, against
        a private copy of the demo on one laptop ({t.machine.cpus} CPUs, {t.target}). Rerun with <code>cd loadtest &amp;&amp; npm test</code>.</>}>
      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <div className="panel overflow-x-auto">
          <p className="px-3 pt-3 text-sm font-semibold" style={{ color: "var(--ink-strong)" }}>
            {t.requests.toLocaleString()} requests from {t.visitors.toLocaleString()} visitors in {t.seconds} s · {t.rps} per second · {errors === 0 ? "no errors" : `${errors} errors`}
          </p>
          <table className="w-full text-sm mt-2">
            <thead><tr className="text-left text-xs muted"><th className={th}>Request</th><th className={th}>Count</th><th className={th}>p50 / p95 / p99</th><th className={th}>Errors</th></tr></thead>
            <tbody>
              {t.endpoints.map((e) => (
                <tr key={e.name} className="border-t" style={{ borderColor: "var(--line)" }}>
                  <td className="px-3 py-2">{e.name}</td><td className={td}>{e.count}</td>
                  <td className={td}>{ms(e.p50)} / {ms(e.p95)} / {ms(e.p99)} ms</td>
                  <td className={td}><Tag tone={e.errors === 0 ? "ok" : "bad"}>{e.errors}</Tag></td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="px-3 py-3 text-xs muted">Reads walk the shared pool, the swaps, a family&rsquo;s graph two hops out, a patient&rsquo;s journey across three graphs
            and the agents&rsquo; shared state. Writes are chat turns (two Message nodes in the family&rsquo;s chat graph) and patient-page visits
            (a Session node in the patient&rsquo;s memory graph). Chat questions name another family, so the chat&rsquo;s guard answers them without a
            language model: this measures the graph, not a model&rsquo;s rate limit.</p>
        </div>
        <div className="panel overflow-x-auto">
          <p className="px-3 pt-3 text-sm font-semibold" style={{ color: "var(--ink-strong)" }}>Checked afterwards, in the graph</p>
          <ul className="px-3 py-2 space-y-2 text-sm">
            {t.checks.map((c) => (
              <li key={c.check} className="flex items-start justify-between gap-3">
                <span>{c.check}</span>
                <Tag tone={c.ok ? "ok" : "bad"}>{c.ok ? `${c.found} ✓` : `${c.found}, expected ${c.expected}`}</Tag>
              </li>
            ))}
          </ul>
          <p className="px-3 pb-3 text-xs muted">The last three: {t.contention.pressed} people press Next week on the same patient in the same second, all looking at
            week {t.contention.week_before}. One moves the journey (the coordinator agent&rsquo;s week runs, p50 of the refusals {ms(t.contention.latency_ms?.p50)} ms);
            the rest are told someone else moved it, so the patient never moves twice. Measured {fmtTime(Date.parse(t.ran_at))}.</p>
        </div>
      </div>
    </Section>
  );
}

export default function HowItWorks() {
  const ov = useResource<GraphOverview>("graph-overview", (a) => a.graphOverview(), 4000);
  const g = ov.data;
  return (
    <div>
      <h1 className="font-display text-[2.1rem] leading-none mb-4" style={{ color: "var(--ink-strong)" }}>How it works</h1>
      <PageIntro id="graph" what={<>What is stored in the FalkorDB graph right now: the graph model, the measured load tests and every named query with its timings.</>} />

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

        <ConcurrencyTest />
        <LoadTestResults />

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
          <rect x={-62} y={-24} width={124} height={48} rx={10} fill={k === "Pair" ? "#183b32" : "#ffffff"} stroke={k === "Pair" ? "#183b32" : SCHEMA_TINT[k] ?? "#c6d2c7"} strokeWidth={SCHEMA_TINT[k] ? 2 : 1} />
          <text y={-3} textAnchor="middle" fontSize={13} fontWeight={700} fill={k === "Pair" ? "#ffffff" : "#1f2c27"}>{k}</text>
          <text y={13} textAnchor="middle" fontSize={10} fill={k === "Pair" ? "#a6d8b5" : "#66736b"}>{sub}</text>
        </g>
      ))}
    </svg>
  );
}

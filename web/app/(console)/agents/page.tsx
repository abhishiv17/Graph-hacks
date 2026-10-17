"use client";
import Link from "next/link";
import { Fragment, useEffect, useRef, useState } from "react";
import { PageIntro } from "@/components/app/Help";
import { ErrorState, Loading, Tag } from "@/components/app/ui";
import AgentNetwork, { DRIVER } from "@/components/app/AgentNetwork";
import { useAction, useResource } from "@/lib/data/source";
import type { AgentEdge, AgentFeedItem, AgentGraph, AgentNode } from "@/lib/data/types";

const ID = /\b([PSL]-\d{4})\b/g;
const PERSONA: Record<string, string> = { "P-0901": "sunita", "P-0902": "rajesh" };

/** Feed text with family and swap ids as links. */
function Linked({ text }: { text: string }) {
  const parts = text.split(ID);
  return <>{parts.map((p, i) => i % 2 === 0 ? <Fragment key={i}>{p}</Fragment> : (
    <Link key={i} className="font-semibold underline decoration-dotted underline-offset-2" style={{ color: "var(--forest)" }}
          href={PERSONA[p] ? `/patients/${PERSONA[p]}` : p.startsWith("P-") ? `/families/${p}` : `/swaps/${p}`}>{p}</Link>))}</>;
}

function ago(ms: number | null | undefined, now: number) {
  if (!ms) return "never";
  const s = Math.max(0, Math.round((now - ms) / 1000));
  return s < 60 ? `${s} s ago` : s < 3600 ? `${Math.round(s / 60)} min ago` : s < 86400 ? `${Math.round(s / 3600)} h ago` : `${Math.round(s / 86400)} d ago`;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** The last sweep in words: what it looked at, and whether anything needed doing. */
function sweepText(w: AgentGraph["watch"]) {
  const c = w.checked;
  const looked = c ? [plural(c.holds, "held offer", "held offers"), plural(c.tests, "lab test out", "lab tests out"),
    plural(c.swaps, "swap's committee papers", "swaps' committee papers"), plural(c.tasks, "open hand-off task", "open hand-off tasks"),
    plural(c.waiting, "family waiting for a new swap", "families waiting for a new swap")].join(", ") + " and the demo patients' new readings"
    : "held offers, lab tests, committee papers, hand-off tasks, families waiting for a new swap and the demo patients' new readings";
  const acted = w.last_actions?.length ? `; acted ${plural(w.last_actions.length, "time", "times")}: ${w.last_actions.join("; ")}` : "; nothing needed doing";
  return `Sweep ${w.sweeps} checked ${looked}${acted}.`;
}

function useNow(ms = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), ms); return () => clearInterval(t); }, [ms]);
  return now;
}

/** One line per edge, in words: "writes decisions to Shared pool (85)". */
function EdgeLine({ e, me, byId }: { e: AgentEdge; me: string; byId: Record<string, AgentNode> }) {
  const out = e.from === me;
  const other = byId[out ? e.to : e.from];
  const verb = e.kind === "hands" ? (out ? "hands off to" : "is handed work by") : e.kind === "writes" ? (out ? "writes to" : "is written by") : (out ? "is read by" : "reads from");
  return (
    <li className="text-sm">
      <span className="muted">{verb}</span> <span className="font-semibold" style={{ color: "var(--ink-strong)" }}>{other?.label ?? "?"}</span>
      <span className="muted">: {e.what.join(", ")} <span className="tnum">({e.n})</span></span>
    </li>
  );
}

function Detail({ g, id, now }: { g: AgentGraph; id: string | null; now: number }) {
  const byId = Object.fromEntries(g.nodes.map((n) => [n.id, n]));
  const n = id ? byId[id] : null;
  if (!n) {
    const agents = g.nodes.filter((x) => x.type === "agent");
    return (
      <div>
        <p className="font-semibold" style={{ color: "var(--ink-strong)" }}>How to read this</p>
        <p className="mt-1 text-sm">Each box is an agent; each cylinder is a FalkorDB graph. Agents never call each other: one writes to a graph, and
          another reads it or picks up a task there. Click anything for what it does and what it touched.</p>
        <ul className="mt-3 space-y-1.5 text-sm">
          {agents.map((a) => (
            <li key={a.id} className="flex items-start gap-2">
              <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: DRIVER[a.driver ?? "rules"].color }} />
              <span><span className="font-semibold" style={{ color: "var(--ink-strong)" }}>{a.label}</span>
                <span className="muted"> · {a.last ? `last acted ${ago(a.last.at, now)}` : "hasn't acted yet"}</span></span>
            </li>
          ))}
        </ul>
      </div>
    );
  }
  const mine = g.edges.filter((e) => e.from === n.id || e.to === n.id);
  const feed = g.feed.filter((f) => f.node === n.id).slice(0, 6);
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-lg font-semibold" style={{ color: "var(--ink-strong)" }}>{n.label}</p>
        {n.type === "agent" && (
          <span className="pill" style={{ background: DRIVER[n.driver ?? "rules"].soft, color: DRIVER[n.driver ?? "rules"].color, border: "1px solid currentColor" }}>
            {DRIVER[n.driver ?? "rules"].label}</span>)}
        {n.type === "graph" && <code className="text-xs">{n.graph}</code>}
        {n.active && <Tag tone="ok">acting now</Tag>}
      </div>
      <p className="mt-1.5 text-sm">{n.does}</p>
      {n.members?.length ? <p className="mt-1 text-xs muted">Hospitals: {n.members.join(", ")}</p> : null}
      {n.type === "agent" && (
        <p className="mt-2 text-xs muted tnum">{n.decisions ?? 0} decisions stored · {n.events ?? 0} feed entries · {n.open_tasks ?? 0} tasks waiting for it</p>
      )}
      {n.type === "task" && n.about?.length ? <p className="mt-2 text-sm">About: <Linked text={n.about.join(", ")} /></p> : null}
      {mine.length > 0 && (
        <>
          <p className="label mt-4 mb-1">In the graph</p>
          <ul className="space-y-1">{mine.map((e, i) => <EdgeLine key={i} e={e} me={n.id} byId={byId} />)}</ul>
        </>
      )}
      {feed.length > 0 && (
        <>
          <p className="label mt-4 mb-1">Latest</p>
          <ul className="space-y-2">{feed.map((f, i) => (
            <li key={i} className="text-sm"><span className="muted text-xs tnum">{ago(f.at, now)} · </span><Linked text={f.text} />
              {f.why && <span className="block text-xs muted">Reason: {f.why}</span>}</li>
          ))}</ul>
        </>
      )}
    </div>
  );
}

const PLAY_MS = 3800;
const feedKey = (f: AgentFeedItem) => `${f.at}|${f.agent}|${f.text}`;

/** Plays the agents' actions on the graph one at a time as they arrive: on opening, the last few (as a replay), then
 * every new one the background watch writes. Nothing is triggered from here; it only shows what already happened. */
function usePlayback(g?: AgentGraph) {
  const seen = useRef<Set<string> | null>(null);
  const queue = useRef<(AgentFeedItem & { replay?: boolean })[]>([]);
  const [playing, setPlaying] = useState<(AgentFeedItem & { replay?: boolean }) | null>(null);
  useEffect(() => {
    if (!g) return;
    if (!seen.current) {
      seen.current = new Set(g.feed.map(feedKey));
      queue.current = g.feed.slice(0, 4).reverse().map((f) => ({ ...f, replay: true }));
      setPlaying((p) => p ?? queue.current.shift() ?? null);
    } else {
      const fresh = g.feed.filter((f) => !seen.current!.has(feedKey(f)));
      fresh.forEach((f) => seen.current!.add(feedKey(f)));
      // A whole sweep can land at once; play the newest dozen, oldest first.
      queue.current.push(...fresh.slice(0, 12).reverse());
    }
  }, [g]);
  useEffect(() => {
    const t = setInterval(() => setPlaying(queue.current.shift() ?? null), PLAY_MS);
    return () => clearInterval(t);
  }, []);
  return { playing, waiting: queue.current.length };
}

export default function AgentsPage() {
  const r = useResource<AgentGraph>("agents-graph", (a) => a.agentsGraph(), 4000);
  const act = useAction();
  const [sel, setSel] = useState<string | null>(null);
  const now = useNow();
  const g = r.data;
  const w = g?.watch;
  const byId = g ? Object.fromEntries(g.nodes.map((n) => [n.id, n])) : {};
  const { playing, waiting } = usePlayback(g);
  const next = w?.last_at ? Math.max(0, Math.round((w.last_at + w.interval_s * 1000 - now) / 1000)) : null;
  const playLeft = w?.autoplay_until ? Math.max(0, Math.ceil((w.autoplay_until - now) / 60000)) : 0;
  const weekRunning = !!w?.busy || act.busy === "week";

  return (
    <div>
      <h1 className="font-display text-[2.1rem] leading-none mb-4" style={{ color: "var(--ink-strong)" }}>Agents</h1>
      <PageIntro id="agents" what={<>Every agent working in the background, the FalkorDB graphs they share, and what each one just did. Drawn live from the graph itself: the agents, their decisions, the tasks they hand each other and the event feed are all nodes in FalkorDB.</>} />

      {r.error && !g ? <ErrorState error={r.error} onRetry={r.reload} what="the agents" /> : !g ? <Loading rows={6} /> : (
        <div className="space-y-5">
          <div className="panel px-4 py-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
            <span className="flex items-center gap-2">
              <span className={`h-2.5 w-2.5 rounded-full ${w?.running ? "animate-pulse" : ""}`} style={{ background: w?.paused || !w?.enabled ? "var(--warn)" : "var(--ok)" }} />
              <span className="font-semibold" style={{ color: "var(--ink-strong)" }}>
                {w?.paused ? "The agents are paused" : !w?.enabled ? "The background watch is off" : w?.running ? "The agents are working right now" : "The agents run on their own"}
              </span>
            </span>
            {w?.enabled && !w.paused && <span className="muted tnum">a sweep every {w.interval_s} s · last {ago(w.last_at, now)}{next !== null ? ` · next in ${next} s` : ""} · {w.sweeps} sweeps since the server started</span>}
            <span className="ml-auto flex flex-wrap items-center gap-2">
              <button type="button" className="btn btn-primary" disabled={weekRunning || !!w?.paused} onClick={() => act.run("week", (a) => a.runWeek())}
                      title="Sunita and Rajesh each move on a week, so the health watch, the coordinator agent, the scheduler and the liaison all act">
                {weekRunning ? "The agents are working…" : "Run a week now"}
              </button>
              <button type="button" className="btn" disabled={!!act.busy || !!w?.paused} aria-pressed={playLeft > 0}
                      onClick={() => act.run("autoplay", (a) => a.autoplay(playLeft === 0))}
                      title="A week passes for one patient on every sweep, so the agents keep working while you watch. Stops on its own.">
                {playLeft > 0 ? `Stop playing (${playLeft} min left)` : "Play on its own"}
              </button>
            </span>
          </div>
          {act.error && <ErrorState error={new Error(act.error)} what="the agents" />}

          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
            <div className="panel p-3">
              <div className="mx-1 mb-2 flex min-h-[2.75rem] items-start gap-2 rounded-lg px-3 py-2 text-sm" aria-live="polite"
                   style={{ background: playing ? "var(--sage-pale)" : "var(--surface-soft)" }}>
                {playing ? (
                  <>
                    <span className="mt-1.5 h-2 w-2 shrink-0 animate-pulse rounded-full" style={{ background: DRIVER[byId[playing.node ?? ""]?.driver ?? "rules"].color }} />
                    <span>
                      <span className="text-xs font-semibold uppercase tracking-wide muted">{playing.replay ? `Replaying · ${ago(playing.at, now)}` : `Live · ${ago(playing.at, now)}`}</span>{" "}
                      <span className="font-semibold" style={{ color: "var(--ink-strong)" }}>{playing.agent}</span>: <Linked text={playing.text} />
                      {waiting > 0 && <span className="muted text-xs"> · {waiting} more to show</span>}
                    </span>
                  </>
                ) : (
                  <span className="muted">
                    <span className="font-semibold" style={{ color: "var(--ink)" }}>Last sweep {ago(w?.last_at, now)}</span>: the agents checked held offers, overdue lab
                    tests, every swap&rsquo;s committee papers, open hand-off tasks and failed links that need a new swap
                    {w?.last_actions?.length ? ` and acted ${w.last_actions.length} time${w.last_actions.length === 1 ? "" : "s"}` : "; nothing needed doing"}.
                    Next sweep {next !== null ? `in ${next} s` : "due"}; what they do plays here as it happens. The health watch and the coordinator agent act when a
                    simulated week passes: press Run a week now, or Next week on <Link className="underline" href="/patients/sunita">Sunita</Link> or <Link className="underline" href="/patients/rajesh">Rajesh</Link>.</span>
                )}
              </div>
              <div className="overflow-x-auto"><div className="min-w-[46rem]"><AgentNetwork g={g} selected={sel} onSelect={setSel} flash={playing} /></div></div>
              <div className="flex flex-wrap gap-x-5 gap-y-1.5 px-2 pb-1 text-xs muted">
                {Object.entries(DRIVER).map(([k, d]) => (
                  <span key={k} className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: d.color }} />{d.label}</span>
                ))}
                <span className="flex items-center gap-1.5"><span className="inline-block w-5 border-t-2" style={{ borderColor: "#2C8A62" }} />writes</span>
                <span className="flex items-center gap-1.5"><span className="inline-block w-5 border-t-2" style={{ borderColor: "#4E8FC4" }} />reads</span>
                <span className="flex items-center gap-1.5"><span className="inline-block w-5 border-t-2 border-dashed" style={{ borderColor: "#D99A35" }} />hands a task (a Task node)</span>
                <span>A moving dot: the agent is acting now, or acted in the last minute</span>
              </div>
            </div>
            <div className="panel p-4"><Detail g={g} id={sel} now={now} /></div>
          </div>

          <div className="panel">
            <div className="px-4 py-3 border-b flex flex-wrap items-baseline gap-x-3" style={{ borderColor: "var(--line)" }}>
              <p className="font-semibold" style={{ color: "var(--ink-strong)" }}>What the agents just did</p>
              <p className="text-xs muted">Newest first, from the graph&rsquo;s Event nodes and the patients&rsquo; memory graphs. To see the health watch and the coordinator
                agent act, press Next week on <Link className="underline" href="/patients/sunita">Sunita</Link> or <Link className="underline" href="/patients/rajesh">Rajesh</Link>.</p>
            </div>
            {w?.enabled && !w.paused && w.last_at && (
              <div className="px-4 py-2.5 grid gap-x-3 gap-y-0.5 sm:grid-cols-[7rem_13rem_1fr] text-sm border-b" style={{ borderColor: "var(--line)", background: "var(--sage-pale)" }}>
                <span className="muted text-xs tnum pt-0.5">{ago(w.last_at, now)}</span>
                <span className="flex items-center gap-2 font-semibold" style={{ color: "var(--ink-strong)" }}>
                  <span className={`h-2 w-2 shrink-0 rounded-full ${w.running ? "animate-pulse" : ""}`} style={{ background: "var(--ok)" }} />Background watch</span>
                <span><Linked text={sweepText(w)} /> <span className="muted text-xs">Next sweep {next !== null ? `in ${next} s` : "due"}.</span></span>
              </div>
            )}
            {g.feed[0] && now - g.feed[0].at > 5 * 60_000 && (
              <p className="px-4 py-2.5 text-sm muted border-b" style={{ borderColor: "var(--line)" }}>
                Quiet for {ago(g.feed[0].at, now).replace(" ago", "")}: every sweep since then found nothing an agent needed to act on. Press Run a
                week now or Play on its own to hand them work, and each action appears here within seconds.</p>
            )}
            {g.feed.length === 0 ? <p className="px-4 py-4 text-sm muted">Nothing yet. Press Run a week now.</p> : (
              <ol className="divide-y" style={{ borderColor: "var(--line)" }}>
                {g.feed.map((f, i) => {
                  const n = f.node ? byId[f.node] : undefined;
                  const d = DRIVER[n?.driver ?? "rules"];
                  return (
                    <li key={i} className="px-4 py-2.5 grid gap-x-3 gap-y-0.5 sm:grid-cols-[7rem_13rem_1fr] text-sm">
                      <span className="muted text-xs tnum pt-0.5">{ago(f.at, now)}</span>
                      <button type="button" className="text-left flex items-center gap-2 font-semibold hover:underline" style={{ color: "var(--ink-strong)" }}
                              onClick={() => f.node && setSel(f.node)}>
                        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: n?.type === "agent" ? d.color : "var(--slate)" }} />{f.agent}
                      </button>
                      <span><Linked text={f.text} />{f.via && <span className="ml-1.5"><Tag tone="ok">tools called {f.via}</Tag></span>}
                        {f.why && <span className="block text-xs muted mt-0.5">The model&rsquo;s reason: {f.why}</span>}</span>
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

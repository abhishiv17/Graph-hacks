"use client";
import Link from "next/link";
import { Fragment, useRef, useState } from "react";
import { PageIntro, Term } from "@/components/app/Help";
import { ErrorState, Tag } from "@/components/app/ui";
import { Icon } from "@/components/app/icons";
import { useProgram } from "@/lib/program";
import { useData, useResource } from "@/lib/data/source";
import type { AskMemory, AskResult, AskStatus } from "@/lib/data/types";
import { fmtTime } from "@/lib/data/derive";

type Turn = { q: string; r?: AskResult; error?: string };

const EXAMPLES: Record<"kidney" | "liver", string[]> = {
  kidney: [
    "Why was S-0076 put together, and how likely is it to hold?",
    "What breaks if Bengaluru's P-0211 withdraws?",
    "Find a new loop for Kolkata's P-0388: 2-way first, then 3-way.",
    "How many waiting families can P-0154's donor reach within 1 hop, and within 3?",
    "Which waiting kidney families hold the most possible loops together?",
    "What has the graph learned from failed tests around P-0211?",
    "What happens if P-9999 withdraws?",
  ],
  liver: [
    "Why was L-0034 put together, and what does each link rest on?",
    "What breaks if Chennai's P-0433 withdraws?",
    "Find a new loop for Kochi's P-0451: 2-way first, then 3-way.",
    "Which committee papers are holding up L-0034?",
    "Which waiting liver families hold the most possible loops together?",
  ],
};

const ID = /\b([PSL]-\d{4}(?:-FB)?)\b/g;

/** Plain text with pair and loop ids turned into links. */
function Linked({ text }: { text: string }) {
  const parts = text.split(ID);
  return <>{parts.map((p, i) => i % 2 === 0 ? <Fragment key={i}>{p}</Fragment>
    : <Link key={i} className="font-semibold underline decoration-dotted underline-offset-2" style={{ color: "var(--forest)" }}
            href={p.startsWith("P-") ? `/pool?pair=${p}` : `/swaps/${p.replace(/-FB$/, "")}`}>{p}</Link>)}</>;
}

/** Bold spans and ids inside one line. */
function Inline({ text }: { text: string }) {
  const parts = text.split(/\*\*(.+?)\*\*/g);
  return <>{parts.map((p, i) => i % 2 ? <strong key={i}><Linked text={p} /></strong> : <Linked key={i} text={p.replace(/`/g, "")} />)}</>;
}

/** The model writes short paragraphs and bullets; render just that, as text (never as HTML). */
function Answer({ text }: { text: string }) {
  const blocks: { list: boolean; lines: string[] }[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) { blocks.push({ list: false, lines: [] }); continue; }
    const item = /^([-*•]|\d+\.)\s+/.test(line);
    const last = blocks[blocks.length - 1];
    if (last && last.list === item && last.lines.length) last.lines.push(item ? line.replace(/^([-*•]|\d+\.)\s+/, "") : line);
    else blocks.push({ list: item, lines: [item ? line.replace(/^([-*•]|\d+\.)\s+/, "") : line] });
  }
  return (
    <div className="space-y-2 text-[0.95rem] leading-relaxed" style={{ color: "var(--ink-strong)" }}>
      {blocks.filter((b) => b.lines.length).map((b, i) => b.list
        ? <ul key={i} className="list-disc pl-5 space-y-1">{b.lines.map((l, j) => <li key={j}><Inline text={l.replace(/^#+\s*/, "")} /></li>)}</ul>
        : <p key={i}>{b.lines.map((l, j) => <Fragment key={j}>{j > 0 && <br />}<Inline text={l.replace(/^#+\s*/, "")} /></Fragment>)}</p>)}
    </div>
  );
}

function Paths({ r }: { r: AskResult }) {
  if (!r.paths.length) return null;
  return (
    <div>
      <p className="label mb-2">Graph paths behind this answer</p>
      <ul className="space-y-2">
        {r.paths.map((p, i) => {
          const loop = p.length > 2 && p[0] === p[p.length - 1];
          const hops = loop ? p.slice(0, -1) : p;
          return (
            <li key={i} className="flex flex-wrap items-center gap-1.5 text-sm">
              {hops.map((id, j) => (
                <Fragment key={j}>
                  {j > 0 && <span aria-hidden="true" className="muted">→</span>}
                  <Link href={`/pool?pair=${id}`} className="rounded-full border px-2.5 py-0.5 tnum hover:bg-[var(--surface-soft)]" style={{ borderColor: "var(--line)" }}>
                    <span className="font-semibold" style={{ color: "var(--ink-strong)" }}>{r.nodes[id]?.city ?? "?"}</span> <span className="muted">{id}</span>
                  </Link>
                </Fragment>
              ))}
              {loop && <span className="muted text-xs">→ back to {r.nodes[hops[0]]?.city ?? hops[0]} (a {hops.length}-way loop)</span>}
            </li>
          );
        })}
      </ul>
      <p className="sr-only">Each arrow is a donation: that family&apos;s donor gives to the next family&apos;s patient.</p>
    </div>
  );
}

function Trace({ r }: { r: AskResult }) {
  const tools = r.trace.filter((t) => !t.tool.startsWith("(memory)"));
  const reads = tools.flatMap((t) => t.queries);
  return (
    <details className="rounded-lg border" style={{ borderColor: "var(--line)" }}>
      <summary className="cursor-pointer px-3 py-2 text-sm font-semibold" style={{ color: "var(--ink-strong)" }}>
        Tool trace · {tools.length} tool call{tools.length === 1 ? "" : "s"} · {reads.length} named quer{reads.length === 1 ? "y" : "ies"}{reads.length ? (reads.every((q) => q.read_only) ? ", all read-only" : ", not all read-only") : ""}{r.remembered_as ? ` · saved to memory as ${r.remembered_as}` : ""}
      </summary>
      <div className="overflow-x-auto border-t" style={{ borderColor: "var(--line)" }}>
        <table className="table">
          <thead><tr><th>#</th><th>Tool the model chose</th><th>Arguments</th><th>Result</th><th>FalkorDB queries</th></tr></thead>
          <tbody>
            {r.trace.map((t, i) => (
              <tr key={i}>
                <td className="tnum text-sm">{i + 1}</td>
                <td className="text-sm font-semibold"><code>{t.tool}</code></td>
                <td className="text-xs"><code>{JSON.stringify(t.input)}</code></td>
                <td className="text-sm">{t.error ? <Tag tone="warn">{t.error}</Tag> : <span className="tnum">{t.rows} row{t.rows === 1 ? "" : "s"} · {t.ms} ms</span>}</td>
                <td className="text-xs">{t.queries.map((q, j) => <span key={j} className="mr-2 inline-block"><code>{q.query}</code> <span className="muted tnum">{q.ms} ms{q.read_only ? " · RO" : ""}</span></span>)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

function AnswerCard({ t, local }: { t: Turn; local: boolean }) {
  return (
    <li className="space-y-3">
      <div className="flex justify-end"><p className="max-w-[46rem] rounded-2xl rounded-br-sm px-4 py-2.5 text-[0.95rem]" style={{ background: "var(--forest)", color: "#fff" }}>{t.q}</p></div>
      {t.error && <ErrorState error={new Error(t.error)} what="that question" />}
      {!t.r && !t.error && (
        <div className="panel p-4 text-sm muted flex items-center gap-2" role="status"><span className="h-2 w-2 rounded-full animate-pulse" style={{ background: "var(--forest-mid)" }} />Choosing tools and walking the graph…{local && " A local model on this machine usually takes about a minute."}</div>
      )}
      {t.r && (
        <div className="panel p-5 space-y-4">
          <Answer text={t.r.answer} />
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {t.r.draft_replaced
              ? <Tag tone="warn" title="The model's draft named ids the graph never returned, so only the query results are shown">Draft replaced: {t.r.unverified_ids.join(", ")} not returned by the graph</Tag>
              : <Tag tone="ok" title="Every pair and loop id in the answer came back from a graph query">Every id checked against the graph{t.r.verified_ids.length ? ` (${t.r.verified_ids.length})` : ""}</Tag>}
            <span className="muted tnum">{(t.r.ms / 1000).toFixed(1)} s · {t.r.model}</span>
          </div>
          <Paths r={t.r} />
          <Trace r={t.r} />
        </div>
      )}
    </li>
  );
}

export default function AskPage() {
  const { api, mode } = useData();
  const { view } = useProgram();
  const status = useResource<AskStatus>("askStatus", (a) => a.askStatus());
  const memory = useResource<{ questions: AskMemory[] }>("askHistory", (a) => a.askHistory());
  const [turns, setTurns] = useState<Turn[]>([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const enabled = !!status.data?.enabled;
  const examples = view?.name === "liver" ? EXAMPLES.liver : view?.name === "kidney" ? EXAMPLES.kidney : [...EXAMPLES.kidney.slice(0, 4), EXAMPLES.liver[1], EXAMPLES.kidney[6]];

  const send = async (question: string) => {
    const text = question.trim();
    if (!text || busy) return;
    const history = turns.filter((t) => t.r).slice(-3).flatMap((t) => [
      { role: "user" as const, content: t.q }, { role: "assistant" as const, content: t.r!.answer }]);
    setTurns((ts) => [...ts, { q: text }]);
    setQ("");
    setBusy(true);
    setTimeout(() => end.current?.scrollIntoView({ behavior: "smooth", block: "end" }), 50);
    try {
      const r = await api.ask(text, history);
      setTurns((ts) => ts.map((t, i) => i === ts.length - 1 ? { ...t, r } : t));
      if (r.remembered_as) memory.reload();
    } catch (e) {
      setTurns((ts) => ts.map((t, i) => i === ts.length - 1 ? { ...t, error: e instanceof Error ? e.message : String(e) } : t));
    } finally {
      setBusy(false);
      setTimeout(() => end.current?.scrollIntoView({ behavior: "smooth", block: "end" }), 50);
    }
  };

  return (
    <div className="max-w-[64rem]">
      <h1 className="font-display text-[2.1rem] leading-none" style={{ color: "var(--ink-strong)" }}>Ask KindRed</h1>
      <p className="mt-2 mb-4 text-sm muted">
        {status.data?.enabled
          ? <>Answering with <strong>{status.data.model}</strong>{status.data.provider === "ollama" ? " running on this machine through Ollama (free, no data leaves the laptop)" : ""}. The tools, checks and memory are the same whichever model answers.</>
          : status.loading ? "Checking which model is available…" : "No model is available right now (see below)."}
      </p>
      <PageIntro id="ask"
        what={<>Ask about any family, swap or failure in plain words. An AI agent (Claude, or a free local model through Ollama) answers by <strong>walking the graph</strong>: it picks from a fixed set of tools, each a human-written, read-only Cypher query, and never writes a query of its own. Every id it uses is looked up in the graph first, so a family that isn&rsquo;t there gets &ldquo;not in the graph&rdquo; instead of a guess. Every answer shows the <Term k="loop">loop</Term> and link paths it rests on and the exact queries that ran, and a check confirms every id in the answer came back from the graph. It is decision support: it never approves or allocates anything.</>}
        steps={[
          <>Pick an example or type a question. Multi-hop questions (who could replace a family, what breaks if one withdraws) are where the graph earns its keep.</>,
          <>Open the tool trace to see which tools the model chose, with which arguments, and which FalkorDB queries ran.</>,
          <>Click a family or swap id to open it.</>,
        ]} />

      {!status.loading && !enabled && (
        <div className="panel p-4 mb-5 flex gap-3 text-sm" role="note">
          <Icon name="info" size={18} />
          <div>
            {mode === "offline"
              ? <>The API isn&rsquo;t reachable, and this offline replay has no recorded answers. Start the backend to ask questions.</>
              : <>Ask KindRed&rsquo;s model ({status.data?.model ?? "unknown"}) isn&rsquo;t available: {status.data?.how}. Every other screen works without it.</>}
          </div>
        </div>
      )}

      {(memory.data?.questions.length ?? 0) > 0 && turns.length === 0 && (
        <details className="panel mb-5" open>
          <summary className="cursor-pointer px-4 py-3 text-sm font-semibold" style={{ color: "var(--ink-strong)" }}>
            Remembered in the graph · {memory.data!.questions.length} earlier answer{memory.data!.questions.length === 1 ? "" : "s"}
          </summary>
          <p className="px-4 text-xs muted">Each verified answer is stored as a <code>Question</code> node linked to the families and swaps it covers, so the agent can recall it in a later session (with its date). You only see answers about hospitals and programs you have access to.</p>
          <ul className="divide-y px-4 pb-2" style={{ borderColor: "var(--line)" }}>
            {memory.data!.questions.map((m) => (
              <li key={m.question_id} className="py-2.5">
                <details>
                  <summary className="cursor-pointer text-sm"><span className="font-semibold" style={{ color: "var(--ink-strong)" }}>{m.question}</span> <span className="muted text-xs">· {fmtTime(m.at)} · {m.question_id}</span></summary>
                  <div className="mt-2 pl-1"><Answer text={m.answer} /></div>
                </details>
              </li>
            ))}
          </ul>
        </details>
      )}

      <ol className="space-y-6 mb-6" aria-live="polite">
        {turns.map((t, i) => <AnswerCard key={i} t={t} local={status.data?.provider === "ollama"} />)}
      </ol>
      <div ref={end} />

      <form className="panel p-3" onSubmit={(e) => { e.preventDefault(); send(q); }}>
        <label htmlFor="ask-q" className="sr-only">Your question</label>
        <div className="flex items-end gap-2">
          <textarea id="ask-q" rows={2} className="input w-full resize-none" value={q} disabled={!enabled || busy}
                    placeholder={enabled ? "e.g. What breaks if Bengaluru's P-0211 withdraws?" : "Ask KindRed is not available"}
                    onChange={(e) => setQ(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(q); } }} />
          <button className="btn btn-primary shrink-0" type="submit" disabled={!enabled || busy || !q.trim()}>{busy ? "Thinking…" : "Ask"}</button>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5" aria-label="Example questions">
          {examples.map((x) => (
            <button key={x} type="button" className="rounded-full border px-3 py-1 text-xs hover:bg-[var(--surface-soft)] disabled:opacity-50" style={{ borderColor: "var(--line)" }}
                    disabled={!enabled || busy} onClick={() => send(x)}>{x}</button>
          ))}
        </div>
      </form>
    </div>
  );
}

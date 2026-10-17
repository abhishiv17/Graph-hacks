"use client";
// Kin, the guide on every screen (Ctrl K): what this page is for, what to try, how to get past the usual hiccups, the
// next step of the guided story, and a box that asks the graph agent (Ask KindRed) a question in plain words.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Icon } from "./icons";
import { Guide, type KinPose } from "@/components/Kin";
import { useStoryTour } from "./StoryTour";
import { DataProvider, useData, useResource } from "@/lib/data/source";
import { ProgramProvider } from "@/lib/program";
import type { AskResult, AskStatus, ChatMessage } from "@/lib/data/types";
import FromMemory from "@/components/app/FromMemory";

type Help = { title: string; say: string; tips: string[]; links?: { href: string; label: string }[]; hiccups?: { q: string; a: string }[] };

const HELP: [RegExp, Help][] = [
  [/^\/patients\/[^/]+/, {
    title: "One patient's case",
    say: "Each press of Next week brings a new lab result. The agents decide what happens next on their own; you watch, and nothing waits for a button.",
    tips: ["Open a month under “Month by month” to see each week, step by step.",
      "“Read before acting” shows what an agent looked up first, and which agent wrote it.",
      "“How it decided” lists the graph tools the coordinator agent chose, in order.",
      "Ask about this patient in the chat; the conversation is kept in their memory graph."],
    hiccups: [{ q: "Next week does nothing", a: "The journey ends at the transplant, or when the six weeks of readings run out. Press Replay to start again." },
      { q: "The chat answer is slow", a: "It asks a language model, which uses the graph tools first. The first answer can take a few seconds." }],
  }],
  [/^\/families\//, {
    title: "One family in the graph",
    say: "The family in the middle breaks into its parts: the patient, the donor, their blood groups, the donor's tissue antigens and the patient's antibodies. The coral path shows why the donor can't give to their own patient.",
    tips: ["Click any circle or line to see what it is and how it connects.", "Hops 1 shows direct donations; 2 adds 2-way swaps; 3 adds 3-way swaps that close back here.",
      "“Explore from here” moves the centre to another family."],
    hiccups: [{ q: "The graph looks crowded", a: "Drag to move it, use the + and − buttons, or go back to 1 hop. Only the strongest links are drawn." }],
  }],
  [/^\/patients$/, {
    title: "Pick a patient",
    say: "Sunita needs a kidney and Rajesh needs part of a liver. Each has six months of records and a family member who wants to donate but can't give to them directly.",
    tips: ["Open either one, then press Next week a few times.", "Rajesh's case shows why depth matters: a 2-way search finds nothing, a 3-way search finds his swap."],
    links: [{ href: "/patients/sunita", label: "Open Sunita" }, { href: "/patients/rajesh", label: "Open Rajesh" }],
  }],
  [/^\/swaps\/[^/]+/, {
    title: "One swap",
    say: "Each line is one donation from a family's donor to the next family's patient, with the reasons stored on it and its chance of going ahead.",
    tips: ["Run the tests to see what happens when one fails.", "KindRed then searches two steps around the break and proposes a repair; nothing changes until a person approves it."],
    hiccups: [{ q: "The test button is greyed out", a: "This swap's tests are done, or it was replaced after a failure. Follow the link to the swap that replaced it." }],
  }],
  [/^\/swaps$/, {
    title: "Every swap in this week's plan",
    say: "A swap is a ring of families who trade donors so every patient receives. Swaps waiting for a person come first.",
    tips: ["Open a swap to see its families, tests and evidence.", "Use the Kidney / Liver / Both switch to change program."],
  }],
  [/^\/pool/, {
    title: "The live map",
    say: "Every dot is a hospital and every line one planned donation across India. Lines that close into a ring are one swap.",
    tips: ["Click a line to open its swap.", "Use the Kidney / Liver / Both switch above the map."],
  }],
  [/^\/ask/, {
    title: "Ask the graph",
    say: "Ask in plain words. The agent picks from fixed graph tools, checks every family it names, and shows the path behind each answer.",
    tips: ["Ask about a family that isn't in the graph, like P-9999: it says so instead of guessing.",
      "Ask for a new swap at 2-way, then at 3-way: the deeper search finds what the shallow one misses."],
  }],
  [/^\/graph/, {
    title: "How it works",
    say: "What FalkorDB does in KindRed: the graph model, every named query with its live timing, the tools agents can call, and the measured concurrency test.",
    tips: ["Click any query in the table to read its Cypher; the timings are from this running server."],
  }],
  [/^\/committee/, { title: "Committee review", say: "Every swap needs the hospital committees' approval. This shows which family's papers hold each swap up.", tips: [] }],
  [/^\/integrity/, { title: "Integrity checks", say: "Checks on the data and the workflow, like a link without evidence or a repair nobody approved. They flag; a person decides.", tips: [] }],
  [/^\/audit/, { title: "Audit trail", say: "Every agent action and human decision, in order, with the facts each one used.", tips: [] }],
  [/^\/case/, { title: "What a family sees", say: "Only their own case, in their language, in plain words.", tips: [] }],
];
const DEFAULT: Help = { title: "Welcome", say: "KindRed helps transplant teams find donor swaps between families, and keeps each swap on track when a test fails.", tips: [],
  links: [{ href: "/patients", label: "Meet a patient" }, { href: "/swaps", label: "See the swaps" }] };
const EXCHANGE = /^\/(pool|swaps|committee|case)/;

const plain = (s: string) => s.replace(/\*\*(.+?)\*\*/g, "$1").replace(/`([^`]+)`/g, "$1");

/** The same guide on pages outside the workspace (the homepage), which have no data or program context of their own. */
export function KinGuideStandalone() {
  return <DataProvider><ProgramProvider><KinGuide /></ProgramProvider></DataProvider>;
}

export default function KinGuide() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const help = HELP.find(([re]) => re.test(path))?.[1] ?? DEFAULT;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setOpen((o) => !o); }
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
  return (
    <>
      {open && <Panel help={help} path={path} onClose={() => setOpen(false)} />}
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label="Ask Kin, your guide (Ctrl K)"
              className="fixed bottom-5 right-5 z-50 flex items-center gap-3 rounded-full border pl-4 pr-1.5 py-1.5 shadow-[0_10px_28px_-12px_rgba(16,42,36,0.45)] transition-transform hover:-translate-y-0.5"
              style={{ background: "var(--surface)", borderColor: "var(--line)" }}>
        <span className="text-left leading-tight">
          <span className="block text-sm font-semibold" style={{ color: "var(--ink-strong)" }}>Ask Kin</span>
          <span className="block text-[0.7rem] muted">Your guide · Ctrl K</span>
        </span>
        <span className="grid h-12 w-12 place-items-center rounded-full" style={{ background: "var(--sage-pale)", border: "1px solid var(--line)" }}>
          <Guide size={34} pose={open ? "idle" : "wave"} />
        </span>
      </button>
    </>
  );
}

/** On a patient's or family's page, Kin talks about that patient only, in the conversation kept in their own graph
 *  (the same one the patient page shows). It starts with a few questions already answered from the graph. */
function subjectOf(path: string): { kind: "persona" | "family"; id: string } | null {
  const p = path.match(/^\/patients\/([^/]+)/);
  if (p) return { kind: "persona", id: decodeURIComponent(p[1]) };
  const f = path.match(/^\/families\/([^/]+)/);
  return f ? { kind: "family", id: decodeURIComponent(f[1]).toUpperCase() } : null;
}

function PatientChat({ kind, id, onClose }: { kind: "persona" | "family"; id: string; onClose: () => void }) {
  const { api } = useData();
  const [msgs, setMsgs] = useState<ChatMessage[] | null>(null);
  const [about, setAbout] = useState("");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let alive = true;
    api.chatHistory(kind, id).then((r) => { if (alive) { setMsgs(r.messages); setAbout(r.about); } }).catch((e) => alive && setErr(String(e.message ?? e)));
    return () => { alive = false; };
  }, [api, kind, id]);
  useEffect(() => { end.current?.scrollIntoView({ block: "nearest" }); }, [msgs?.length]);
  const send = async (text: string) => {
    if (!text.trim() || busy) return;
    setBusy(true); setErr(null); setQ("");
    setMsgs((m) => [...(m ?? []), { message_id: "pending", role: "user", text, at: Date.now(), tools: [], model: null }]);
    try { const r = await api.chatAsk(kind, id, text); setMsgs(r.messages); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };
  const first = about.replace(/^the family in /, "").split(" ")[0] || "this patient";
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-[0.12em] muted">Ask about {about || "this patient"}</p>
      <p className="mt-0.5 text-xs muted">Only about them. The conversation is kept in their own graph, so any browser sees it.</p>
      <div className="mt-2 max-h-64 overflow-y-auto space-y-2 pr-1">
        {!msgs && !err && <p className="text-sm muted">Opening the conversation…</p>}
        {(msgs ?? []).map((m, i) => (
          <div key={m.message_id + i} className={`rounded-lg px-3 py-2 text-sm ${m.role === "user" ? "ml-6" : "mr-3"}`}
               style={{ background: m.role === "user" ? "var(--sage)" : "var(--sage-pale)", color: "var(--ink-strong)" }}>
            <p className="whitespace-pre-line">{plain(m.text)}</p>
            {m.role === "assistant" && m.model && <p className="mt-0.5 text-[0.68rem] muted">{/starter/.test(m.model) ? "Answered from the graph" : /guard/.test(m.model) ? "Kept to this patient" : `From the graph${m.tools?.length ? `: ${m.tools.join(", ")}` : ""}`}</p>}
            {m.role === "assistant" && <FromMemory items={m.memory} />}
          </div>
        ))}
        {busy && <p className="text-sm muted">Looking it up in the graph…</p>}
        <div ref={end} />
      </div>
      {err && <p className="mt-1 text-xs" style={{ color: "var(--bad)" }}>{err}</p>}
      <form className="mt-2 flex gap-2" onSubmit={(e) => { e.preventDefault(); send(q); }}>
        <label className="sr-only" htmlFor="kin-pq">Your question</label>
        <input id="kin-pq" value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Ask about ${first}…`} maxLength={1000}
               className="min-w-0 flex-1 rounded-full border px-3.5 py-2 text-sm outline-none focus:border-[var(--forest-mid)]" style={{ borderColor: "var(--line)" }} />
        <button className="btn btn-sm btn-primary" disabled={busy || !q.trim()}>{busy ? "Asking…" : "Ask"}</button>
      </form>
      <p className="mt-1.5 text-xs muted">About other families or the whole pool? <Link href="/ask" onClick={onClose} className="underline" style={{ color: "var(--forest)" }}>Ask KindRed</Link>.</p>
    </div>
  );
}

function Panel({ help, path, onClose }: { help: Help; path: string; onClose: () => void }) {
  const { mode, retryLive, api } = useData();
  const status = useResource<AskStatus>("askStatus", (a) => a.askStatus());
  const tour = useStoryTour();
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<{ q: string; r?: AskResult; err?: string } | null>(null);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { input.current?.focus(); }, []);
  const pose: KinPose = busy ? "think" : res?.r ? "cheer" : "wave";
  const ask = async (question: string) => {
    if (!question.trim() || busy) return;
    setBusy(true); setRes({ q: question });
    try { setRes({ q: question, r: await api.ask(question, []) }); }
    catch (e) { setRes({ q: question, err: e instanceof Error ? e.message : String(e) }); }
    finally { setBusy(false); setQ(""); }
  };
  const showTour = tour && EXCHANGE.test(path);
  const step = showTour ? tour.steps[tour.now] : null;
  return (
    <section role="dialog" aria-label="Kin, your guide"
             className="fixed bottom-24 right-5 z-50 w-[400px] max-w-[calc(100vw-2.5rem)] max-h-[72vh] overflow-y-auto rounded-2xl border shadow-[0_24px_60px_-20px_rgba(16,42,36,0.45)]"
             style={{ background: "var(--surface)", borderColor: "var(--line)" }}>
      <div className="flex items-start gap-3 p-4 pb-3 sticky top-0" style={{ background: "var(--surface)" }}>
        <Guide size={52} pose={pose} />
        <div className="min-w-0 flex-1">
          <p className="text-[1.02rem] font-semibold" style={{ color: "var(--ink-strong)" }}>Hi, I&rsquo;m Kin.</p>
          <p className="text-sm muted leading-snug">I look after the red thread between families. I can explain this screen, help when something&rsquo;s stuck, or ask the graph for you.</p>
        </div>
        <button className="rounded-md p-1 muted hover:bg-[var(--surface-soft)]" onClick={onClose} aria-label="Close the guide"><Icon name="close" size={18} /></button>
      </div>

      <div className="px-4 pb-4 space-y-4">
        {mode === "offline" && (
          <div className="rounded-xl p-3 text-sm" style={{ background: "var(--warn-soft)", color: "var(--warn)" }}>
            <p className="font-semibold">I can&rsquo;t reach the KindRed server.</p>
            <p className="mt-0.5">You&rsquo;re seeing the last recorded state. Start the backend (see the README), then reconnect.</p>
            <button className="btn btn-sm mt-2" onClick={() => retryLive()}>Reconnect</button>
          </div>
        )}

        <div className="rounded-xl p-3" style={{ background: "var(--sage-pale)" }}>
          <p className="text-xs font-bold uppercase tracking-[0.12em]" style={{ color: "var(--forest-mid)" }}>On this page · {help.title}</p>
          <p className="mt-1 text-sm" style={{ color: "var(--ink-strong)" }}>{help.say}</p>
          {help.tips.length > 0 && (
            <ul className="mt-2 space-y-1 text-sm">
              {help.tips.map((t) => <li key={t} className="flex gap-2"><span style={{ color: "var(--forest-mid)" }}>•</span><span>{t}</span></li>)}
            </ul>
          )}
          {help.links && <p className="mt-2 flex flex-wrap gap-2">{help.links.map((l) => <Link key={l.href} href={l.href} onClick={onClose} className="btn btn-sm">{l.label}</Link>)}</p>}
        </div>

        {step && tour && (
          <div className="rounded-xl border p-3" style={{ borderColor: "var(--line)" }}>
            <p className="text-xs font-bold uppercase tracking-[0.12em] muted">Guided story · {tour.organ} · step {tour.now + 1} of {tour.steps.length}</p>
            <div className="mt-1.5 flex gap-1" aria-hidden="true">
              {tour.steps.map((s, i) => <span key={i} className="h-1.5 flex-1 rounded-full" style={{ background: s.done ? "var(--forest-mid)" : i === tour.now ? "var(--mint)" : "var(--line)" }} />)}
            </div>
            <p className="mt-2 text-sm font-semibold" style={{ color: "var(--ink-strong)" }}>{step.title}</p>
            <p className="text-sm muted">{step.why}</p>
            {step.action && <div className="mt-2" onClick={(e) => { if ((e.target as HTMLElement).closest("a")) onClose(); }}>{step.action}</div>}
            {tour.error && <p className="mt-1 text-xs" style={{ color: "var(--bad)" }}>{tour.error}</p>}
          </div>
        )}

        {help.hiccups && help.hiccups.length > 0 && (
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.12em] muted">Something not right?</p>
            <ul className="mt-1.5 space-y-1.5">
              {help.hiccups.map((h) => (
                <li key={h.q}>
                  <details className="group rounded-lg border px-3 py-2 text-sm" style={{ borderColor: "var(--line)" }}>
                    <summary className="cursor-pointer list-none flex items-center gap-1.5 font-medium" style={{ color: "var(--ink-strong)" }}>
                      <Icon name="chevron" size={12} className="transition-transform group-open:rotate-90" />{h.q}
                    </summary>
                    <p className="mt-1 muted">{h.a}</p>
                  </details>
                </li>
              ))}
            </ul>
          </div>
        )}

        {subjectOf(path) ? <PatientChat {...subjectOf(path)!} onClose={onClose} /> : <div>
          <p className="text-xs font-bold uppercase tracking-[0.12em] muted">Ask the graph</p>
          {status.data && !status.data.enabled ? (
            <p className="mt-1 text-sm muted">Asking needs a language model: {status.data.how ?? "see the README"}.</p>
          ) : (
            <>
              <form className="mt-1.5 flex gap-2" onSubmit={(e) => { e.preventDefault(); ask(q); }}>
                <label className="sr-only" htmlFor="kin-q">Ask about a family or swap</label>
                <input id="kin-q" ref={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. What breaks if P-0211 withdraws?"
                       className="min-w-0 flex-1 rounded-full border px-3.5 py-2 text-sm outline-none focus:border-[var(--forest-mid)]" style={{ borderColor: "var(--line)" }} />
                <button className="btn btn-sm btn-primary" disabled={busy || !q.trim()}>{busy ? "Asking…" : "Ask"}</button>
              </form>
              {!res && (
                <p className="mt-2 flex flex-wrap gap-1.5">
                  {["Which families hold the most swaps together?", "What happens if P-9999 withdraws?"].map((s) => (
                    <button key={s} className="rounded-full border px-2.5 py-1 text-xs hover:bg-[var(--surface-soft)]" style={{ borderColor: "var(--line)" }} onClick={() => ask(s)}>{s}</button>
                  ))}
                </p>
              )}
              {res && (
                <div className="mt-2 rounded-xl border p-3 text-sm" style={{ borderColor: "var(--line)" }} aria-live="polite">
                  <p className="text-xs muted">You asked: {res.q}</p>
                  {busy && <p className="mt-1 muted">Looking it up in the graph…</p>}
                  {res.err && <p className="mt-1" style={{ color: "var(--bad)" }}>{res.err}</p>}
                  {res.r && (
                    <>
                      <p className="mt-1 whitespace-pre-line" style={{ color: "var(--ink-strong)" }}>{plain(res.r.answer)}</p>
                      <p className="mt-2 text-xs muted">Answered from {res.r.trace.length} graph tool call{res.r.trace.length === 1 ? "" : "s"}.{" "}
                        <Link href="/ask" onClick={onClose} className="underline" style={{ color: "var(--forest)" }}>See the full trace in Ask KindRed</Link></p>
                    </>
                  )}
                </div>
              )}
            </>
          )}
        </div>}
      </div>
    </section>
  );
}

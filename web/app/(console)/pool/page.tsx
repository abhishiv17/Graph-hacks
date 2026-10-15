"use client";
import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import PoolMap, { linkKey } from "@/components/app/PoolMap";
import { PageIntro, Term } from "@/components/app/Help";
import { DataScope, EmptyState, ErrorState, EvalTag, Field, Loading, OrganTag, StatusPill, Tag } from "@/components/app/ui";
import { Icon } from "@/components/app/icons";
import { useLoop, usePairs } from "@/lib/data/hooks";
import { useAction, useData, useResource } from "@/lib/data/source";
import type { AgentState, PairFacts, PersonaSummary, Pool, PoolLink } from "@/lib/data/types";
import { loopRoute, pct, statusOf, type PairRow } from "@/lib/data/derive";
import { ORGAN_NAMES, organOf, organOfLoop } from "@/lib/organs";
import { useProgram } from "@/lib/program";

export default function PoolPage() {
  return <Suspense fallback={<Loading rows={6} />}><LivePool /></Suspense>;
}

function LivePool() {
  const res = usePairs();
  const { mode } = useData();
  const act = useAction();
  const router = useRouter();
  const params = useSearchParams();
  const [selected, setSelected] = useState<string | null>(params.get("pair"));
  const [focusLoop, setFocusLoop] = useState<string | null>(null);
  const [linkSel, setLinkSel] = useState<string | null>(null);
  const [citySel, setCitySel] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [hospital, setHospital] = useState("");
  const [filter, setFilter] = useState<"all" | "in_loop" | "waiting">("all");
  const { organ, view, includes, program, setProgram } = useProgram();
  // A link such as a demo patient's "see it on the map" names its program; follow it on every navigation.
  useEffect(() => {
    const want = params.get("program");
    if ((want === "kidney" || want === "liver" || want === "all") && want !== program) setProgram(want);
  }, [params]); // eslint-disable-line react-hooks/exhaustive-deps
  const fromPatient = !!params.get("patient");
  const factsRes = useResource(`pairs:${organ ?? "all"}`, (a) => a.pairs(organ), 10000);
  const facts = useMemo(() => new Map((factsRes.data?.pairs ?? []).map((f) => [f.pair_id, f])), [factsRes.data]);
  // A switch of program drops anything picked in the other program, so nothing from it stays on screen.
  useEffect(() => { setFocusLoop(null); setLinkSel(null); setCitySel(null); setHospital(""); }, [organ]);
  useEffect(() => { const p = params.get("pair"); if (p) setSelected(p); }, [params]);

  const raw = res.data?.pool;
  // The pool as this program sees it: its own loops, links and hospitals. "All programs" lists both side by side.
  const pool = useMemo(() => raw && ({
    ...raw,
    loops: raw.loops.filter((l) => includes(l.organ)),
    links: (raw.links ?? []).filter((l) => includes(l.organ)),
    hospitals: raw.hospitals
      .map((h) => ({ ...h, pairs: organ === "liver" ? h.liver_pairs ?? 0 : organ === "kidney" ? h.pairs - (h.liver_pairs ?? 0) : h.pairs }))
      .filter((h) => h.pairs > 0),
    open_tasks: raw.open_tasks.filter((t) => includes(raw.loops.find((l) => l.loop_id === t.loop_id)?.organ)),
  }), [raw, organ, includes]);
  const rows = (res.data?.rows ?? []).filter((r) => includes(r.organ));
  const tasks = new Set((pool?.open_tasks ?? []).map((t) => t.loop_id));
  const loops = useMemo(() => [...(pool?.loops ?? [])].sort((a, b) =>
    Number(tasks.has(b.loop_id)) - Number(tasks.has(a.loop_id)) ||
    Number(b.status === "broken") - Number(a.status === "broken") ||
    Number(b.status === "testing") - Number(a.status === "testing") ||
    b.pairs.length - a.pairs.length), [pool]); // eslint-disable-line react-hooks/exhaustive-deps
  const sel = rows.find((r) => r.pair_id === selected) ?? null;
  const shown = focusLoop ?? sel?.loop?.loop_id ?? loops[0]?.loop_id ?? null;
  const focus = loops.find((l) => l.loop_id === shown);

  const filtered = useMemo(() => rows.filter((r) => {
    const s = q.trim().toLowerCase();
    if (s && !(r.pair_id.toLowerCase().includes(s) || r.city.toLowerCase().includes(s) || r.loop?.loop_id.toLowerCase().includes(s))) return false;
    if (hospital && r.code !== hospital) return false;
    if (filter === "in_loop" && !r.loop) return false;
    if (filter === "waiting" && r.loop) return false;
    return true;
  }), [rows, q, hospital, filter]);

  const columns = COLUMNS[organ ?? "all"];
  const pick = (r: PairRow) => { setSelected(r.pair_id); setFocusLoop(null); router.replace(`/pool?pair=${r.pair_id}`, { scroll: false }); };
  const t = raw?.tiles;
  const bo = organ ? raw?.by_organ?.[organ] : null;
  const agents = useResource<AgentState>("agents", (a) => a.agents(), 5000);
  const links = pool?.links ?? [];
  const chosenLink = links.find((l) => linkKey(l) === linkSel) ?? null;
  const chennaiAdded = !!pool?.demo?.chennai_added;
  const bridges = new Set((pool?.bridges ?? []).map((b) => b.pair_id));
  const pickLoop = (id: string) => { setFocusLoop(id); setLinkSel(null); setCitySel(null); };

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4 mb-4">
        <div>
          <h1 className="font-display text-[2.1rem] leading-none" style={{ color: "var(--ink-strong)" }}>{view ? `${view.label} exchange pool` : "Live exchange pool"}</h1>
          <p className="mt-2 text-sm muted">{pool ? `${pool.hospitals.length} hospitals · ${pool.hospitals.reduce((n, h) => n + h.pairs, 0)} ${view ? view.label.toLowerCase() : ""} families registered · this week's plan ${pool.plan?.run_id ?? "–"}` : "Connecting…"}</p>
        </div>
        <div className="flex flex-wrap items-start gap-3">
          <ActionButton label={act.busy === "reset" ? "Restarting…" : "Restart demo"} icon="reset" disabled={!!act.busy}
            hint={mode === "offline" ? "Offline: restart the recorded demo replay. The API isn't reachable, so nothing is rebuilt." : "Rebuild the synthetic kidney and liver families and run this week's match again."}
            onClick={() => { if (confirm("Restart the demo? Every swap, lab result and approval goes back to the starting point.")) act.run("reset", (a) => a.reset()); }} />
          {organ !== "liver" && (
            <ActionButton label={act.busy === "chennai" ? "Adding…" : chennaiAdded ? "Chennai family added" : "Add a kidney family (Chennai)"} disabled={!!act.busy || chennaiAdded}
              hint="A new kidney patient and donor register in Chennai. The intake agent checks the legal rules and adds their links to the graph."
              onClick={() => act.run("chennai", (a) => a.addChennai())} />
          )}
          <ActionButton primary label={act.busy === "plan" ? "Matching…" : "Re-run matching"} disabled={!!act.busy || mode === "offline"}
            hint="Find every possible swap among families still waiting, program by program, then let the optimiser choose the best set."
            onClick={() => act.run("plan", (a) => a.runPlan())} />
        </div>
      </div>
      {act.error && <div className="mb-4"><ErrorState error={new Error(act.error)} what="that action" /></div>}
      <PatientBanner id={params.get("patient")} />

      {!fromPatient && <PageIntro id="pool" what={<>The shared pool of families from every hospital. Each dot is a hospital. Each line is one planned <Term k="link">donation</Term>: a donor from one family gives a kidney, or part of their liver, to the patient of another family. Lines that close a ring make one <Term k="loop">swap loop</Term>. {view ? <>This view shows the {view.label.toLowerCase()} program only.</> : <>All programs: kidney and liver loops are listed side by side, but families only ever swap within their own program; the line colour shows which.</>}</>}
        steps={[
          <>Scroll or pinch to zoom; drag to move around the map.</>,
          <>Click any single line to see that donation: who gives to whom, how likely it is to hold, and the reasons stored in the graph.</>,
          <>Click a hospital to see only its families&rsquo; donations, or pick a swap from the list on the right.</>,
        ]} />}

      <dl className="mb-4 grid grid-cols-2 lg:grid-cols-4 border rounded-[10px] overflow-hidden" style={{ borderColor: "var(--line)", background: "var(--surface)" }}>
        {([
          ["Families waiting", t ? (organ === "liver" ? t.liver_waiting : organ === "kidney" ? t.waiting - (t.liver_waiting ?? 0) : t.waiting) : null, <>Not in any planned swap yet</>],
          [<Term key="s" k="loop">Swaps planned</Term>, bo ? bo.loops : t?.loops, <>{organ ? "" : `${byOrgan(raw, (o) => o.loops)} · `}{links.length} donations</>],
          [<Term key="e" k="expected">Expected transplants</Term>, bo ? bo.expected_tx : t?.expected_tx, <>out of {bo ? bo.planned_tx : t?.planned_tx ?? "–"} if every test passed{organ ? "" : ` · ${byOrgan(raw, (o) => o.expected_tx)}`}</>],
          organ === "liver" ? ["Hardest to match", t?.liver_urgent ?? 0, <>liver patients with <Term k="meld">MELD</Term> 25 or more</>]
            : organ === "kidney" ? ["Hardest to match", t?.highly_sensitised, <>patients with <Term k="cpra">cPRA</Term> above 85%</>]
            : ["Hardest to match", t ? <>{t.highly_sensitised} <span className="text-base font-normal muted">kidney</span> · {t.liver_urgent ?? 0} <span className="text-base font-normal muted">liver</span></> : null,
              <>kidney: <Term k="cpra">cPRA</Term> above 85% · liver: <Term k="meld">MELD</Term> 25 or more</>],
        ] as [React.ReactNode, React.ReactNode, React.ReactNode][]).map(([k, v, sub], i) => (
          <div key={i} className={`px-4 py-3 ${i % 2 ? "border-l" : ""} ${i > 1 ? "border-t lg:border-t-0" : ""} ${i === 2 ? "lg:border-l" : ""}`} style={{ borderColor: "var(--line)" }}>
            <dt className="label">{k}</dt>
            <dd className="mt-1 text-2xl font-semibold tnum" style={{ color: "var(--ink-strong)" }}>{v ?? "–"}</dd>
            <dd className="text-xs muted mt-0.5">{sub}</dd>
          </div>
        ))}
      </dl>

      {res.error && !res.data ? <ErrorState error={res.error} onRetry={res.reload} what="the pool" /> : (
        <section className="overflow-hidden rounded-2xl border" style={{ borderColor: "var(--line)", background: "var(--surface)" }} aria-label="Live map of planned donations">
          <div className="grid lg:grid-cols-[minmax(0,1.5fr)_minmax(340px,1fr)]">
            <div className="relative">
              {!pool ? <div className="h-[560px] lg:h-[680px]" /> : (
                <PoolMap className="h-[560px] lg:h-[680px]" hospitals={pool.hospitals} loops={pool.loops} links={links}
                  focusLoop={chosenLink ? chosenLink.loop_id : citySel ? null : shown} selectedLink={linkSel} selectedCity={citySel}
                  onSelectLink={(k) => { setLinkSel(k); setCitySel(null); }}
                  onSelectCity={(c) => { setCitySel((x) => (x === c ? null : c)); setLinkSel(null); }}
                  onBackground={() => { setLinkSel(null); setCitySel(null); }} />
              )}
              <AgentPulse s={agents.data} includes={includes} />
            </div>

            <div className="border-t lg:border-t-0 lg:border-l flex flex-col min-h-0 lg:max-h-[680px]" style={panelBorder}>
              {chosenLink && pool ? (
                <LinkPanel link={chosenLink} pool={pool} onClose={() => setLinkSel(null)} onStep={(k) => setLinkSel(k)} />
              ) : citySel && pool ? (
                <CityPanel code={citySel} pool={pool} onClose={() => setCitySel(null)} onPickLoop={pickLoop} onPickLink={(k) => setLinkSel(k)} />
              ) : (
                <>
                  {focus && (
                    <div className="p-5 sm:p-6 border-b" style={panelBorder}>
                      <p className="text-[0.68rem] font-semibold uppercase tracking-[0.12em]" style={{ color: "#66736B" }}>Swap in focus · bold lines on the map</p>
                      <div className="mt-2 flex items-start justify-between gap-3">
                        <div>
                          <p className="font-display text-2xl leading-tight" style={{ color: "#183B32" }}>{focus.loop_id} <span className="text-base" style={{ color: "#66736B" }}>· {organOf(focus).label.toLowerCase()} · {focus.kind}</span></p>
                          <p className="mt-1 text-[0.95rem]" style={{ color: "#34433D" }}>{loopRoute(focus)}</p>
                        </div>
                        <DarkStatus status={focus.status} repair={tasks.has(focus.loop_id)} />
                      </div>
                      {focus.status === "broken" ? (
                        <p className="mt-4 text-sm" style={{ color: "#C2463A" }}>A link failed, so this loop can&rsquo;t go ahead as planned. Open it to review the repair.</p>
                      ) : (
                        <div className="mt-4 grid grid-cols-2 gap-4 text-sm" style={{ color: "#66736B" }}>
                          <div><span className="block font-display text-2xl tnum" style={{ color: "#1F2C27" }}>{pct(focus.p_success)}</span><Term k="chance">chance every link holds</Term></div>
                          <div><span className="block font-display text-2xl tnum" style={{ color: "#1F2C27" }}>{focus.expected_tx} <span className="text-base">of {focus.pairs.length}</span></span><Term k="expected">expected transplants</Term>{focus.has_fallback && <> · has a <Term k="fallback">fallback</Term></>}</div>
                        </div>
                      )}
                      <Link href={`/swaps/${focus.loop_id}`} className="mt-5 inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold"
                            style={{ background: "var(--mint)", color: "var(--forest-deep)" }}>
                        {organOf(focus).tests} and papers for this swap <Icon name="chevron" size={15} />
                      </Link>
                    </div>
                  )}
                  <p className="px-5 sm:px-6 pt-4 pb-2 text-[0.68rem] font-semibold uppercase tracking-[0.12em]" style={{ color: "#66736B" }}>All planned swaps · {loops.length} · click one to light it up</p>
                  <ul className="flex-1 overflow-y-auto max-h-[360px] lg:max-h-none px-2 sm:px-3 pb-3">
                    {!pool ? <li className="px-3 py-2 text-sm" style={{ color: "#66736B" }}>Loading…</li> : loops.map((l) => (
                      <li key={l.loop_id}>
                        <button className="w-full text-left flex items-center gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-[var(--surface-soft)]"
                                aria-pressed={shown === l.loop_id} style={{ background: shown === l.loop_id ? "rgba(44,90,75,0.08)" : undefined }}
                                onClick={() => pickLoop(l.loop_id)}>
                          <span className="h-2 w-2 rounded-full shrink-0" style={{ background: l.status === "broken" || tasks.has(l.loop_id) ? "#C2463A" : l.status === "testing" ? "#D99A35" : "#2C8A62" }} aria-hidden="true" />
                          <span className="font-semibold tnum text-sm w-14 shrink-0" style={{ color: "#1F2C27" }}>{l.loop_id}</span>
                          <span className="text-[0.68rem] font-semibold uppercase tracking-[0.08em] w-10 shrink-0" style={{ color: organOf(l).line }}>{organOf(l).label}</span>
                          <span className="flex-1 truncate text-sm" style={{ color: "#4A5952" }}>{loopRoute(l)}</span>
                          <span className="text-xs shrink-0" style={{ color: "#66736B" }}>{statusOf(l.status, tasks.has(l.loop_id)).label}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          </div>
        </section>
      )}

      <div className="mt-10 grid xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] gap-8">
        <section>
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <h2 className="text-lg font-semibold mr-auto" style={{ color: "var(--ink-strong)" }}>{view ? `${view.label} families` : "Every registered family"} <span className="text-sm font-normal muted">· click one for details · <Term k="bridge">bridge</Term> = connects many possible swaps</span></h2>
            <label className="flex items-center gap-2 rounded-full border px-3 py-1.5 bg-white" style={{ borderColor: "var(--line)" }}>
              <Icon name="search" size={15} className="muted" /><span className="sr-only">Search families</span>
              <input className="bg-transparent outline-none text-sm w-36" placeholder="Pair or city" value={q} onChange={(e) => setQ(e.target.value)} />
            </label>
            <label><span className="sr-only">Hospital</span>
              <select className="input !rounded-full !py-1.5" value={hospital} onChange={(e) => setHospital(e.target.value)}>
                <option value="">All hospitals</option>
                {(pool?.hospitals ?? []).map((h) => <option key={h.code} value={h.code}>{h.city}</option>)}
              </select>
            </label>
            <label><span className="sr-only">Status</span>
              <select className="input !rounded-full !py-1.5" value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)}>
                <option value="all">Any status</option>
                <option value="in_loop">In a planned swap</option>
                <option value="waiting">Waiting for a match</option>
              </select>
            </label>
          </div>
          {!res.data ? <Loading rows={6} /> : (
            <div className="panel overflow-hidden">
              <div className="max-h-[460px] overflow-auto">
                <table className="table">
                  <thead className="sticky top-0 z-10" style={{ background: "var(--surface)" }}><tr>{columns.map((c) => <th key={c.key} title={c.hint}>{c.label}</th>)}</tr></thead>
                  <tbody>
                    {filtered.map((r) => (
                      <tr key={r.pair_id} aria-selected={r.pair_id === selected} tabIndex={0} className="cursor-pointer"
                          onClick={() => pick(r)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(r); } }}>
                        {columns.map((c) => <td key={c.key} className={c.key === "pair" ? "font-semibold tnum whitespace-nowrap" : "text-sm whitespace-nowrap"} style={c.key === "pair" ? { color: "var(--ink-strong)" } : undefined}>{c.cell(r, facts.get(r.pair_id), bridges.has(r.pair_id))}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {filtered.length === 0 && <p className="p-4 text-sm muted">No families match.</p>}
              </div>
            </div>
          )}
        </section>
        <PairDetail row={sel} fact={sel ? facts.get(sel.pair_id) : undefined} repairReady={!!sel?.loop && tasks.has(sel.loop.loop_id)} />
      </div>
    </div>
  );
}

type Column = { key: string; label: string; hint?: string; cell: (r: PairRow, f: PairFacts | undefined, bridge: boolean) => React.ReactNode };

const PAIR_COL: Column = { key: "pair", label: "Family (pair)", cell: (r, _f, bridge) => <>{r.pair_id}{bridge && <span className="ml-2 align-middle"><Tag tone="sim" title="Bridge family: connects many possible swaps (betweenness centrality)">bridge</Tag></span>}</> };
const HOSP_COL: Column = { key: "hospital", label: "Hospital", cell: (r) => r.city };
const SWAP_COL: Column = { key: "swap", label: "Status", cell: (r) => r.loop ? <span>{r.loop.loop_id}</span> : <span className="muted">Waiting for a match</span> };
const ABO_COL: Column = { key: "abo", label: "Blood type", hint: "donor → patient", cell: (_r, f) => f ? `${f.donor_abo} → ${f.patient_abo}` : "–" };
const CAND_COL: Column = { key: "cand", label: "Candidate exchanges", hint: "live links: patients this donor could give to · donors who could give to this patient",
  cell: (_r, f) => f ? <span className="tnum">{f.gives_to} out · {f.receives_from} in</span> : "–" };
const PAPERS_COL: Column = { key: "papers", label: "Committee papers", cell: (r) => r.missing_docs ? <Tag tone="warn">{r.missing_docs} missing</Tag> : <span className="muted">Complete</span> };

/** Each program shows its own clinical columns; meaningless ones (cPRA for liver, graft size for kidney) never appear. */
const COLUMNS: Record<"all" | "kidney" | "liver", Column[]> = {
  all: [PAIR_COL, { key: "organ", label: "Program", cell: (r) => <OrganTag organ={r.organ} /> }, HOSP_COL, SWAP_COL, PAPERS_COL],
  kidney: [PAIR_COL, HOSP_COL, ABO_COL,
    { key: "cpra", label: "Sensitisation", hint: "cPRA", cell: (_r, f) => f?.cpra != null ? <span className="tnum">cPRA {f.cpra}%</span> : "–" },
    { key: "hla", label: "HLA typing", cell: (_r, f) => f?.hla_typing ? (f.hla_typing === "complete" ? <span className="muted">Complete</span> : <Tag tone="warn">{f.hla_typing}</Tag>) : "–" },
    { key: "xm", label: "Crossmatch", cell: (_r, f) => !f?.crossmatch ? "–" : f.crossmatch === "negative" ? <Tag tone="ok">Negative</Tag> : f.crossmatch === "positive" ? <Tag tone="bad">Positive</Tag> : f.crossmatch === "pending" ? <Tag tone="warn">Pending</Tag> : f.crossmatch === "cancelled" ? <Tag tone="neutral">Not needed</Tag> : <span className="muted">Not requested</span> },
    SWAP_COL, CAND_COL],
  liver: [PAIR_COL, HOSP_COL, ABO_COL,
    { key: "meld", label: "Recipient", hint: "MELD and weight", cell: (_r, f) => f ? <span className="tnum">MELD {f.meld ?? "–"} · {f.patient_weight_kg ?? "–"} kg</span> : "–" },
    { key: "graft", label: "Graft suitability", hint: "ELIGIBLE once CT volumetry confirms the lobe; REVIEW_REQUIRED while the volume is a height-and-weight estimate", cell: (_r, f) => <EvalTag status={f?.graft_suitability} /> },
    { key: "anat", label: "Anatomical review", hint: "vascular and biliary", cell: (_r, f) => <EvalTag status={f?.anatomy_review} /> },
    { key: "deval", label: "Donor evaluation", cell: (_r, f) => <EvalTag status={f?.donor_evaluation} /> },
    { key: "reval", label: "Recipient evaluation", cell: (_r, f) => <EvalTag status={f?.recipient_evaluation} /> },
    SWAP_COL, CAND_COL],
};

function ActionButton({ label, hint, onClick, disabled, primary, icon }: { label: string; hint: string; onClick: () => void; disabled?: boolean; primary?: boolean; icon?: string }) {
  return (
    <div className="w-[13.5rem]">
      <button className={`btn ${primary ? "btn-primary" : ""} w-full justify-center`} disabled={disabled} onClick={onClick} title={hint}>
        {icon && <Icon name={icon} size={15} />} {label}
      </button>
      <p className="mt-1 text-[0.72rem] leading-snug muted">{hint}</p>
    </div>
  );
}

/** Arriving from a demo patient's journey: say whose swap the map is showing, and how to get back. */
function PatientBanner({ id }: { id: string | null }) {
  const r = useResource<PersonaSummary[]>(id ? "personas" : null, (a) => a.personas());
  const p = r.data?.find((x) => x.id === id);
  if (!p) return null;
  const c = p.case;
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-[10px] border px-4 py-3" style={{ borderColor: "var(--line)", background: "var(--sage-pale)" }}>
      <p className="text-sm">
        <span className="font-semibold" style={{ color: "var(--ink-strong)" }}>{p.name}&rsquo;s {p.transplanted ? "transplant" : "swap"}</span>
        {c ? <> · {c.loop_id} · {c.route} · highlighted on the map</> : <> · not in a swap yet; the agents are still searching</>}
      </p>
      <Link href={`/patients/${p.id}`} className="btn btn-sm">Back to {p.name.split(" ")[0]}&rsquo;s journey</Link>
    </div>
  );
}

/** A quiet sign that the agents are working on their own: when they last checked and what they did. */
function AgentPulse({ s, includes }: { s?: AgentState; includes: (organ?: string | null) => boolean }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  if (!s || !s.enabled || s.offline) return null;
  const ago = s.last_at ? Math.max(0, Math.round((now - s.last_at) / 1000)) : null;
  // Only this program's actions: an action naming another program's loop stays out of this view.
  const mine = (s.last_actions ?? []).filter((a) => (a.match(/\b[SL]-\d{4}\b/g) ?? []).every((id) => includes(organOfLoop(id)?.name)));
  const last = mine[0];
  return (
    <div className="absolute right-4 top-4 sm:right-5 sm:top-4 max-w-[16rem] text-right pointer-events-none rounded-lg px-3 py-2" style={{ background: "rgba(255,255,255,0.92)" }} aria-live="polite">
      <p className="inline-flex items-center gap-2 text-[0.7rem] font-semibold uppercase tracking-[0.12em]" style={{ color: "#66736B" }}>
        <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full rounded-full opacity-60 animate-ping" style={{ background: "#2C8A62" }} /><span className="relative inline-flex h-2 w-2 rounded-full" style={{ background: "#2C8A62" }} /></span>
        Agents on watch
      </p>
      <p className="mt-1 text-xs" style={{ color: "#4A5952" }}>{ago === null ? "Starting…" : `Checked the graph ${ago < 5 ? "just now" : `${ago}s ago`}`}</p>
      {last && <p className="mt-0.5 text-xs truncate" style={{ color: "#34433D" }} title={mine.join(" · ")}>{last}</p>}
    </div>
  );
}

function DarkStatus({ status, repair }: { status: string; repair: boolean }) {
  const s = statusOf(status, repair);
  const c = s.tone === "bad" ? ["#FBEDEB", "#9E4238"] : s.tone === "warn" ? ["#FBF1DE", "#8A5A12"] : ["var(--ok-soft)", "#1F6B48"];
  return <span className="shrink-0 rounded-full px-3 py-1 text-xs font-semibold" style={{ background: c[0], color: c[1] }} title={s.hint}>{s.label}</span>;
}

/** "kidney 1 · liver 4" for a per-organ figure from /api/pool. */
function byOrgan(pool: Pool | undefined, pick: (o: { loops: number; expected_tx: number; planned_tx: number }) => number) {
  return ORGAN_NAMES.map((o) => `${o} ${pool?.by_organ?.[o] ? pick(pool.by_organ[o]) : 0}`).join(" · ");
}

const panelBorder = { borderColor: "var(--line)" };
const kicker = "text-[0.7rem] uppercase tracking-[0.1em]";

function PanelHead({ label, title, sub, onClose }: { label: string; title: React.ReactNode; sub?: React.ReactNode; onClose: () => void }) {
  return (
    <div className="p-5 sm:p-6 border-b" style={panelBorder}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-[0.68rem] font-semibold uppercase tracking-[0.12em]" style={{ color: "#66736B" }}>{label}</p>
        <button onClick={onClose} className="rounded-md p-1 hover:bg-[var(--surface-soft)]" style={{ color: "#34433D" }} aria-label="Close and go back to the swap list"><Icon name="close" size={16} /></button>
      </div>
      <p className="mt-1 font-display text-[1.45rem] leading-tight" style={{ color: "#183B32" }}>{title}</p>
      {sub && <p className="mt-1 text-sm" style={{ color: "#66736B" }}>{sub}</p>}
    </div>
  );
}

/** One clicked line on the map: a single donation, explained from the facts on its graph edge. */
function LinkPanel({ link, pool, onClose, onStep }: { link: PoolLink; pool: Pool; onClose: () => void; onStep: (key: string) => void }) {
  const loop = pool.loops.find((l) => l.loop_id === link.loop_id);
  const where = (pid: string) => loop?.pairs.find((p) => p.pair_id === pid)?.city ?? "";
  const ring = (pool.links ?? []).filter((l) => l.loop_id === link.loop_id).sort((a, b) => a.pos - b.pos);
  const i = ring.findIndex((l) => l.pos === link.pos);
  const failed = !!link.failed_cause || link.status === "failed";
  const p = link.p_success ?? 0;
  const pill = "rounded-full border px-3 py-1 text-xs hover:bg-[var(--surface-soft)]";
  const o = organOf(link);
  return (
    <div className="flex-1 overflow-y-auto">
      <PanelHead label="One planned donation" onClose={onClose}
        title={<>{where(link.from_pair)} <span style={{ color: "#66736B" }}>→</span> {where(link.to_pair)}</>}
        sub={<>The donor from family {link.from_pair} gives {o.gift} to the patient of family {link.to_pair}.</>} />
      <div className="p-5 sm:p-6 space-y-5 text-sm" style={{ color: "#34433D" }}>
        <div className="grid grid-cols-2 gap-4">
          <div><p className={kicker} style={{ color: "#66736B" }}>Donor</p><p className="mt-0.5" style={{ color: "#1F2C27" }}>{link.donor_relation}, blood group {link.donor_abo}{link.lobe ? <>, {link.lobe} lobe (<Term k="grwr">GRWR</Term> {link.grwr}%)</> : null}</p><p className="text-xs">{where(link.from_pair)} · {link.from_pair}</p></div>
          <div><p className={kicker} style={{ color: "#66736B" }}>Patient</p><p className="mt-0.5" style={{ color: "#1F2C27" }}>blood group {link.patient_abo}, {o.name === "liver" ? <><Term k="meld">MELD</Term> {link.patient_meld}, {link.patient_weight_kg} kg</> : <><Term k="cpra">cPRA</Term> {link.patient_cpra}%</>}</p><p className="text-xs">{where(link.to_pair)} · {link.to_pair}</p></div>
        </div>
        {failed ? (
          <div className="rounded-lg px-3 py-2.5" style={{ background: "#FBEDEB", color: "#9E4238" }}>
            <p className="font-semibold">This donation failed its {o.test}</p>
            <p className="mt-0.5">{link.failed_detail ?? link.failed_cause}. The graph remembers it as a <code>FAILED</code> edge, so this donor is never proposed to this patient again.</p>
          </div>
        ) : (
          <div>
            <div className="flex items-baseline justify-between"><span>Chance it holds</span><span className="font-display text-2xl tnum" style={{ color: "#183B32" }}>{Math.round(p * 100)}%</span></div>
            <div className="mt-1.5 h-2 rounded-full" style={{ background: "var(--line)" }}><div className="h-full rounded-full" style={{ width: `${p * 100}%`, background: "#2C8A62" }} /></div>
            <p className="mt-1.5 text-xs" style={{ color: "#66736B" }}>{o.chanceNote}</p>
          </div>
        )}
        <div>
          <p className={kicker} style={{ color: "#66736B" }}>Why the graph says this can work</p>
          <ul className="mt-1.5 space-y-1.5">
            {(link.reasons ?? []).map((r) => <li key={r} className="flex gap-2"><span className="mt-0.5 shrink-0" style={{ color: "#2C8A62" }}><Icon name="check" size={14} /></span>{r}</li>)}
            {!link.reasons?.length && <li style={{ color: "#66736B" }}>No live compatibility edge (the link failed).</li>}
          </ul>
        </div>
        {loop && (
          <div className="rounded-lg border px-3 py-3" style={{ borderColor: "var(--line)" }}>
            <p>Part of swap <span className="font-semibold" style={{ color: "#183B32" }}>{loop.loop_id}</span> ({loop.kind}): {loopRoute(loop)}. It only goes ahead if all {ring.length} donations in the ring hold.</p>
            {ring.length > 1 && (
              <div className="mt-2.5 flex flex-wrap gap-2">
                <button className={pill} style={{ borderColor: "var(--line)" }} onClick={() => onStep(linkKey(ring[(i - 1 + ring.length) % ring.length]))}>← Previous donation in this swap</button>
                <button className={pill} style={{ borderColor: "var(--line)" }} onClick={() => onStep(linkKey(ring[(i + 1) % ring.length]))}>Next donation →</button>
              </div>
            )}
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <Link href={`/swaps/${link.loop_id}`} className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold" style={{ background: "var(--mint)", color: "var(--forest-deep)" }}>Open swap {link.loop_id} <Icon name="chevron" size={15} /></Link>
          <Link href={`/case/${link.to_pair}`} className="inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold hover:bg-[var(--surface-soft)]" style={{ borderColor: "var(--line)", color: "#1F2C27" }}>What this patient&rsquo;s family sees</Link>
        </div>
        <p className="text-xs" style={{ color: "#66736B" }}>Read live from FalkorDB: the <code>CAN_GIVE_TO</code> edge between two <code>Pair</code> nodes (query Q24_loop_links). Synthetic data.</p>
      </div>
    </div>
  );
}

/** A clicked hospital: its families' donations in and out, and the swaps they belong to. */
function CityPanel({ code, pool, onClose, onPickLoop, onPickLink }: { code: string; pool: Pool; onClose: () => void; onPickLoop: (id: string) => void; onPickLink: (k: string) => void }) {
  const h = pool.hospitals.find((x) => x.code === code);
  const cityOf = new Map<string, string>();
  pool.loops.forEach((l) => l.pairs.forEach((p) => cityOf.set(p.pair_id, p.code)));
  const name = (pid: string) => pool.hospitals.find((x) => x.code === cityOf.get(pid))?.city ?? "";
  const touching = (pool.links ?? []).filter((l) => cityOf.get(l.from_pair) === code || cityOf.get(l.to_pair) === code);
  const loops = pool.loops.filter((l) => l.pairs.some((p) => p.code === code));
  return (
    <div className="flex-1 overflow-y-auto">
      <PanelHead label="Hospital" onClose={onClose} title={h?.city ?? code}
        sub={<>{h?.pairs} families registered here{h?.liver_pairs ? ` (${h.liver_pairs} liver)` : ""}. Names and documents stay in this hospital&rsquo;s own private graph (<code>hosp_{code.toLowerCase()}</code>); only the medical facts matching needs are shared.</>} />
      <div className="p-5 sm:p-6 space-y-5 text-sm" style={{ color: "#34433D" }}>
        <div>
          <p className={`${kicker} mb-1.5`} style={{ color: "#66736B" }}>Donations in and out · {touching.length} · click to inspect</p>
          <ul className="space-y-0.5">
            {touching.map((l) => (
              <li key={linkKey(l)}>
                <button className="w-full text-left rounded-md px-2 py-1.5 hover:bg-[var(--surface-soft)] flex justify-between gap-2" onClick={() => onPickLink(linkKey(l))}>
                  <span>{name(l.from_pair)} → {name(l.to_pair)} <span style={{ color: "#66736B" }}>· {l.loop_id}</span></span>
                  <span className="tnum" style={{ color: l.failed_cause ? "#C2463A" : "#1F2C27" }}>{l.failed_cause ? "failed" : l.p_success != null ? `${Math.round(l.p_success * 100)}%` : ""}</span>
                </button>
              </li>
            ))}
            {touching.length === 0 && <li style={{ color: "#66736B" }}>No planned donations involve this hospital yet.</li>}
          </ul>
        </div>
        <div>
          <p className={`${kicker} mb-1.5`} style={{ color: "#66736B" }}>Swaps with a family from {h?.city} · {loops.length}</p>
          <ul className="space-y-0.5">
            {loops.map((l) => (
              <li key={l.loop_id}><button className="w-full text-left rounded-md px-2 py-1.5 hover:bg-[var(--surface-soft)]" onClick={() => onPickLoop(l.loop_id)}>
                <span className="font-semibold" style={{ color: "#1F2C27" }}>{l.loop_id}</span> · {loopRoute(l)}
              </button></li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function PairDetail({ row, fact, repairReady }: { row: PairRow | null; fact?: PairFacts; repairReady: boolean }) {
  const loop = useLoop(row?.loop?.loop_id ?? null);
  if (!row) return (
    <section>
      <h2 className="text-lg font-semibold mb-3" style={{ color: "var(--ink-strong)" }}>Family details</h2>
      <EmptyState title="Select a family">Pick a row to see which swap they are in, and why each of their donations was chosen.</EmptyState>
    </section>
  );
  const fam = loop.data?.families?.find((f: any) => f.pair_id === row.pair_id);
  const out = loop.data?.links?.find((l: any) => l.from_pair === row.pair_id);
  const inn = loop.data?.links?.find((l: any) => l.to_pair === row.pair_id);
  const o = organOf(row);
  return (
    <section>
      <div className="flex items-center justify-between gap-3 mb-3">
        <h2 className="text-lg font-semibold flex items-center gap-2" style={{ color: "var(--ink-strong)" }}>{row.pair_id} · {row.city} <OrganTag organ={row.organ} /></h2>
        {row.loop && <Link className="btn btn-sm" href={`/case/${row.pair_id}`}>Family view</Link>}
      </div>
      <div className="panel p-5 space-y-5">
        <div><DataScope scope="shared" /></div>
        {fact && o.name === "liver" && (
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <Field label="Graft suitability"><EvalTag status={fact.graft_suitability} /></Field>
            <Field label="Anatomical review"><EvalTag status={fact.anatomy_review} /></Field>
            <Field label="Donor evaluation"><EvalTag status={fact.donor_evaluation} /></Field>
            <Field label="Recipient evaluation"><EvalTag status={fact.recipient_evaluation} /></Field>
            <Field label="Surgical suitability review"><EvalTag status={fact.surgical_review} /></Field>
            <Field label="Candidate exchanges">{fact.gives_to} out · {fact.receives_from} in</Field>
          </dl>
        )}
        {fact && o.name === "kidney" && (
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <Field label="HLA typing">{fact.hla_typing}</Field>
            <Field label="Crossmatch">{fact.crossmatch}</Field>
            <Field label="Candidate exchanges">{fact.gives_to} out · {fact.receives_from} in</Field>
          </dl>
        )}
        {!row.loop ? <p className="text-sm muted">Waiting for a match. No planned swap includes this family yet.</p> : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Link className="font-semibold hover:underline" style={{ color: "var(--forest)" }} href={`/swaps/${row.loop.loop_id}`}>{row.loop.loop_id} · {loopRoute(row.loop)}</Link>
              <StatusPill status={row.loop.status} repairReady={repairReady} />
            </div>
            {loop.error && !loop.data ? <ErrorState error={loop.error} onRetry={loop.reload} what="this swap" /> : !loop.data ? <Loading rows={3} /> : (
              <>
                {fam && (
                  <dl className="grid grid-cols-2 gap-4">
                    <Field label="Donor">{fam.donor_relation}, blood group {fam.donor_abo}</Field>
                    <Field label="Patient">blood group {fam.patient_abo}, {o.patient(fam)}</Field>
                    <Field label="Why they can't donate within the family">{fam.own_clash}</Field>
                    <Field label="Committee papers">{row.missing_docs ? <span style={{ color: "var(--warn)" }}>{row.missing_docs} missing</span> : "Complete"}</Field>
                  </dl>
                )}
                {[[`Receives ${o.gift.replace("their", "a donor's")} from`, inn, inn?.from_city], ["Their donor gives to", out, out?.to_city]].map(([label, l, city]: any) => l && (
                  <div key={label} className="border-t pt-4" style={{ borderColor: "var(--line)" }}>
                    <p className="label">{label} {city} · {Math.round(l.p_success * 100)}% likely to hold</p>
                    <ul className="mt-1.5 text-sm space-y-1" style={{ color: l.status === "failed" ? "var(--bad)" : undefined }}>
                      {(l.reasons ?? []).map((r: string) => <li key={r} className="flex gap-2"><Icon name="check" size={14} className="mt-0.5 shrink-0" />{r}</li>)}
                      {l.failed_detail && <li className="flex gap-2"><Icon name="x" size={14} className="mt-0.5 shrink-0" />{l.failed_detail}</li>}
                    </ul>
                  </div>
                ))}
              </>
            )}
          </>
        )}
        <div className="border-t pt-4" style={{ borderColor: "var(--line)" }}>
          <DataScope scope="private" />
          <p className="mt-1 text-xs muted">Names, phone, identity papers{o.name === "liver" ? ", CT-measured volumes and the clinical notes behind each evaluation status" : " and full HLA typing"} stay in {row.city}&rsquo;s private graph (<code>hosp_{row.code.toLowerCase()}</code>). The shared exchange never receives them; this screen can&rsquo;t show them.</p>
        </div>
      </div>
    </section>
  );
}

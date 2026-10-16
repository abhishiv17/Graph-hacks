"use client";
import Link from "next/link";
import { Family } from "@/components/Kin";
import { EmptyState, ErrorState, Loading, OrganTag, PageHeader, Tag } from "@/components/app/ui";
import { Icon } from "@/components/app/icons";
import { useAction, useResource } from "@/lib/data/source";
import { organOf } from "@/lib/organs";
import type { PersonaSummary, PairFacts } from "@/lib/data/types";
import { useMemo, useState } from "react";
import { STAGE_TONE } from "@/lib/personas";

const STEPS = [
  { icon: "database", title: "Six months on file", text: "Monthly lab results sit in the hospital's private graph. The agents' memory of the patient has a graph of its own." },
  { icon: "play", title: "Press Next week", text: "A new result arrives. The health watch compares the trend with what it remembers and notices when the patient gets worse." },
  { icon: "swaps", title: "Agents act on their own", text: "They find a swap, book appointments, run the tests, chase the papers and book the transplant. No approve button." },
  { icon: "pool", title: "See it on the map", text: "The patient's swap appears on the live map, from the first offer to the transplant." },
];

export default function Patients() {
  const r = useResource<PersonaSummary[]>("personas", (a) => a.personas(), 10000);
  const act = useAction();
  return (
    <div>
      <PageHeader title="Who is waiting, and what is being done for them?"
        description="Each family has a patient and a relative who wants to donate but can't give to them directly. Start with one of the two demo patients below." />

      <h2 className="text-[1.05rem] font-semibold mb-3" style={{ color: "var(--ink-strong)" }}>Followed week by week</h2>

      <ol className="grid sm:grid-cols-2 xl:grid-cols-4 gap-3 mb-8">
        {STEPS.map((s, i) => (
          <li key={s.title} className="panel p-4">
            <p className="flex items-center gap-2 text-sm font-semibold" style={{ color: "var(--ink-strong)" }}>
              <span className="grid h-6 w-6 place-items-center rounded-full text-xs" style={{ background: "var(--sage)", color: "var(--forest)" }}>{i + 1}</span>{s.title}
            </p>
            <p className="mt-1.5 text-sm muted">{s.text}</p>
          </li>
        ))}
      </ol>

      {r.error && !r.data ? <ErrorState error={r.error} onRetry={r.reload} what="the demo patients" />
        : !r.data ? <Loading rows={3} />
        : r.data.length === 0 ? (
          <EmptyState title="The demo patients aren't loaded yet"
            action={<button className="btn btn-primary" disabled={!!act.busy} onClick={() => act.run("reset", (a) => a.reset())}>{act.busy ? "Loading…" : "Load the demo"}</button>}>
            Loading the demo creates the shared pools and both demo patients. It takes a few seconds.
          </EmptyState>
        ) : (
          <ul className="grid lg:grid-cols-2 gap-5">
            {r.data.map((p) => {
              const o = organOf(p.organ);
              return (
                <li key={p.id}>
                  <Link href={`/patients/${p.id}`} className="panel block p-5 h-full transition-shadow hover:shadow-md">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <Family id={p.id} size={46} />
                        <div>
                          <p className="text-lg font-semibold leading-tight" style={{ color: "var(--ink-strong)" }}>{p.name}</p>
                          <p className="text-sm muted">{p.age} · {p.city} · {p.pair_id}</p>
                        </div>
                      </div>
                      <OrganTag organ={p.organ} />
                    </div>
                    <p className="mt-4 text-sm">{p.story}</p>
                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      <Tag tone={STAGE_TONE[p.stage ?? ""] ?? "neutral"}>{p.stage_label}</Tag>
                      {p.last && <span className="text-sm tnum" style={{ color: "var(--ink-strong)" }}>{p.measure.label} {p.last.value}</span>}
                      {p.transplanted ? <Tag tone="ok">Transplant done</Tag> : p.case ? <Tag tone="ok">In swap {p.case.loop_id}</Tag> : null}
                    </div>
                    {p.trend && <p className="mt-1.5 text-xs muted">{p.trend}</p>}
                    <p className="mt-4 inline-flex items-center gap-1 text-sm font-semibold" style={{ color: "var(--forest)" }}>
                      Open {p.name.split(" ")[0]}&rsquo;s journey <Icon name="chevron" size={15} />
                    </p>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      <AllFamilies />
      <p className="mt-6 text-xs muted">Synthetic people and readings. A software prototype, not a clinical tool. Sign-up and login are a later feature.</p>
    </div>
  );
}

const STATUS: Record<string, string> = { waiting: "Waiting for a swap", offered: "Swap offered", testing: "Tests under way", locked: "Transplant booked",
  transplanted: "Transplant done", committee: "With the committee" };

/** Every family in the shared pool, each one a door into the graph explorer. */
function AllFamilies() {
  const r = useResource<{ pairs: PairFacts[] }>("pairs", (a) => a.pairs(), 15000);
  const [q, setQ] = useState("");
  const [organ, setOrgan] = useState<"all" | "kidney" | "liver">("all");
  const [waiting, setWaiting] = useState(false);
  const [n, setN] = useState(24);
  const rows = useMemo(() => (r.data?.pairs ?? []).filter((p) =>
    (organ === "all" || p.organ === organ) && (!waiting || p.status === "waiting")
    && `${p.pair_id} ${p.city} ${p.donor_relation}`.toLowerCase().includes(q.trim().toLowerCase())), [r.data, q, organ, waiting]);
  return (
    <section className="mt-10" aria-labelledby="all-h">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1">
          <h2 id="all-h" className="text-[1.05rem] font-semibold" style={{ color: "var(--ink-strong)" }}>Every family in the pool{r.data ? ` · ${r.data.pairs.length}` : ""}</h2>
          <p className="text-sm muted">Open one to see why its donor can&rsquo;t give to their own patient, and who they could swap with.</p>
        </div>
        <input value={q} onChange={(e) => { setQ(e.target.value); setN(24); }} placeholder="Search ID, city or relation" aria-label="Search families"
               className="w-60 rounded-full border px-4 py-2 text-sm outline-none focus:border-[var(--forest-mid)]" style={{ borderColor: "var(--line)", background: "var(--surface)" }} />
        <div className="inline-flex rounded-full border p-0.5" style={{ borderColor: "var(--line)", background: "var(--surface)" }} role="radiogroup" aria-label="Program">
          {(["all", "kidney", "liver"] as const).map((o) => (
            <button key={o} role="radio" aria-checked={organ === o} onClick={() => { setOrgan(o); setN(24); }} className="rounded-full px-3 py-1 text-xs font-semibold capitalize"
                    style={{ background: organ === o ? "var(--forest)" : "transparent", color: organ === o ? "#fff" : "var(--ink)" }}>{o === "all" ? "Both" : o}</button>
          ))}
        </div>
        <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={waiting} onChange={(e) => setWaiting(e.target.checked)} /> Still waiting</label>
      </div>
      {r.error && !r.data ? <ErrorState error={r.error} onRetry={r.reload} what="the families in the pool" /> : !r.data ? <Loading rows={4} /> : (
        <>
          <ul className="mt-4 grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {rows.slice(0, n).map((p) => (
              <li key={p.pair_id}>
                <Link href={`/families/${p.pair_id}`} className="panel flex items-center gap-3 p-3.5 h-full transition-shadow hover:shadow-md">
                  <Family id={p.pair_id} size={34} className="shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 font-semibold" style={{ color: "var(--ink-strong)" }}>{p.pair_id} <span className="text-sm font-normal muted truncate">{p.city}</span></p>
                    <p className="text-xs muted truncate">The {p.donor_relation} ({p.donor_abo}) wants to give to the patient ({p.patient_abo}){p.organ === "kidney" && p.cpra != null ? ` · cPRA ${p.cpra}%` : p.meld != null ? ` · MELD ${p.meld}` : ""}</p>
                    <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
                      <OrganTag organ={p.organ} />
                      <span className="rounded-full px-2 py-0.5" style={{ background: "var(--surface-soft)" }}>{STATUS[p.status] ?? p.status}{p.loop_id ? ` · ${p.loop_id}` : ""}</span>
                      <span className="muted tnum">gives to {p.gives_to} · from {p.receives_from}</span>
                    </p>
                  </div>
                  <Icon name="chevron" size={16} className="muted shrink-0" />
                </Link>
              </li>
            ))}
          </ul>
          {rows.length === 0 && <p className="mt-4 text-sm muted">No family matches.</p>}
          {rows.length > n && <button className="btn mt-4" onClick={() => setN((x) => x + 48)}>Show more ({rows.length - n} left)</button>}
        </>
      )}
    </section>
  );
}

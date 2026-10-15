"use client";
import Link from "next/link";
import { EmptyState, ErrorState, Loading, OrganTag, PageHeader, Tag } from "@/components/app/ui";
import { Icon } from "@/components/app/icons";
import { useAction, useResource } from "@/lib/data/source";
import { organOf } from "@/lib/organs";
import type { PersonaSummary } from "@/lib/data/types";
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
      <PageHeader title="Demo patients"
        description="No sign-up. Open a synthetic patient, move time forward, and watch the agents take them from a falling lab result to a transplant." />

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
                        <span className="grid h-11 w-11 place-items-center rounded-full text-sm font-bold" style={{ background: "var(--sage)", color: o.tone }}>
                          {p.name.split(" ").map((w) => w[0]).join("")}
                        </span>
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
      <p className="mt-6 text-xs muted">Synthetic people and readings. A software prototype, not a clinical tool. Sign-up and login are a later feature.</p>
    </div>
  );
}

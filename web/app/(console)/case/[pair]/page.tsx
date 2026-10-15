"use client";
import Link from "next/link";
import { PageIntro, Term } from "@/components/app/Help";
import { use, useState } from "react";
import { ErrorState, Loading, OrganTag, PageHeader } from "@/components/app/ui";
import { organOf } from "@/lib/organs";
import { Icon } from "@/components/app/icons";
import { useResource } from "@/lib/data/source";
import { Logo } from "@/components/Logo";
import { Family } from "@/components/Kin";

const DOT: Record<string, string> = { done: "var(--forest-mid)", current: "var(--mint)", waiting: "var(--line-strong)" };

export default function Case({ params }: { params: Promise<{ pair: string }> }) {
  const { pair } = use(params);
  const [lang, setLang] = useState("en");
  const r = useResource<any>(`family:${pair}:${lang}`, (a) => a.family(pair, lang), 5000);
  const m = r.data?.message;
  return (
    <div>
      <PageIntro id="family" what={<>This is what the patient&rsquo;s family would see on their phone: where their swap stands and what happens next, in plain words and their own language. It shows only their own case, never another family&rsquo;s details. Every sentence is built from facts in the graph, not invented by AI.</>} />
      <PageHeader title={`Family view · ${pair}${r.data?.facts?.organ ? ` · ${organOf(r.data.facts.organ).label} program` : ""}`}
        description="What this family sees on their phone, in their language. Only their own case, nothing about other families."
        actions={
          <div className="flex rounded-lg border p-0.5" role="group" aria-label="Language" style={{ borderColor: "var(--line-strong)" }}>
            {[["en", "English"], ["hi", "हिन्दी"]].map(([k, v]) => (
              <button key={k} className="rounded-md px-3 py-1.5 text-sm font-semibold" aria-pressed={lang === k} onClick={() => setLang(k)}
                      style={{ background: lang === k ? "var(--forest)" : "transparent", color: lang === k ? "#fff" : "var(--ink)" }}>{v}</button>
            ))}
          </div>
        } />

      {r.error && !r.data ? <ErrorState error={r.error} onRetry={r.reload} what={`the family view for ${pair}`} /> : !m ? <Loading rows={5} /> : (
        <div className="grid lg:grid-cols-[minmax(0,26rem)_1fr] gap-10 items-start">
          {/* What the family's phone shows */}
          <div className="mx-auto w-full max-w-[26rem] rounded-[28px] border-8 p-5 shadow-sm" style={{ borderColor: "var(--forest-deep)", background: "var(--ivory)" }} lang={lang}>
            <div className="flex items-center justify-between"><Logo size={22} /><span className="text-xs muted">{pair}{r.data.facts?.city ? ` · ${r.data.facts.city}` : ""}</span></div>
            <div className="mt-4 flex justify-center"><Family id={pair} size={70} /></div>
            <h2 className="mt-5 font-display text-[1.45rem] leading-snug" style={{ color: "var(--forest)" }}>{m.headline}</h2>
            <p className="mt-3 text-[0.95rem]">{m.body}</p>
            <ol className="mt-5 space-y-3">
              {m.steps.map((s: any) => (
                <li key={s.label} className="flex gap-3 items-start">
                  <span className="mt-1 h-3 w-3 rounded-full shrink-0" style={{ background: DOT[s.state], boxShadow: s.state === "current" ? "0 0 0 4px var(--sage)" : undefined }} aria-hidden="true" />
                  <div>
                    <p className={s.state === "waiting" ? "muted" : "font-semibold"} style={{ color: s.state === "waiting" ? undefined : "var(--ink-strong)" }}>{s.label}<span className="sr-only"> ({s.state})</span></p>
                    {s.note && <p className="text-xs muted">{s.note}</p>}
                  </div>
                </li>
              ))}
            </ol>
            <p className="mt-5 rounded-lg p-3 text-sm" style={{ background: "var(--warn-soft)" }}>{m.remedy_note}</p>
          </div>

          <div className="space-y-6 max-w-xl">
            <section>
              <h2 className="font-semibold" style={{ color: "var(--ink-strong)" }}>Where this text comes from</h2>
              <p className="text-sm muted mt-1">The patient liaison writes only from facts the graph returns for this pair (named query Q16_family_status). It never sees other families&rsquo; data.</p>
            </section>
            {r.data.facts && (
              <dl className="grid grid-cols-2 gap-4 text-sm">
                {[["Program", <OrganTag key="o" organ={r.data.facts.organ} />],
                  ["Exchange", r.data.facts.loop_id ? <Link className="hover:underline" href={`/swaps/${r.data.facts.loop_id}`}>{r.data.facts.loop_id} ({r.data.facts.loop_kind})</Link> : "–"],
                  ["Exchange status", r.data.facts.loop_status ?? "–"],
                  ["Donor", r.data.facts.donor_relation],
                  ["Committee", String(r.data.facts.approval_state ?? "–").replace(/_/g, " ")],
                  ["Earlier failed links", r.data.facts.failed_count],
                  ["Joined a replacement loop", r.data.facts.replaced ? "Yes" : "No"]].map(([k, v]) => (
                  <div key={String(k)}><dt className="label">{k}</dt><dd className="mt-0.5" style={{ color: "var(--ink-strong)" }}>{v}</dd></div>
                ))}
              </dl>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

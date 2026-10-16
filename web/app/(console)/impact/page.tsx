"use client";
import { useState } from "react";
import { PageIntro, Term } from "@/components/app/Help";
import { EmptyState, ErrorState, Loading, Section } from "@/components/app/ui";
import { useResource } from "@/lib/data/source";
import { useProgram } from "@/lib/program";

type CI = [number, number, number];
type Policy = { title: string; subtitle: string; transplants: CI; o_matched_pct: CI; hs_matched_pct: CI; median_weeks: CI; tests_wasted: CI; loops_repaired: CI; arrived: CI };
type Sim = { ready: boolean; runs: number; weeks: number; policies: string[]; results: Record<string, Policy>; validation: Record<string, any> };

const OURS = "swapnet";

export default function ImpactPage() {
  const sim = useResource<Sim>("sim", (a) => a.sim());
  const { organ } = useProgram();
  const d = sim.data;
  return (
    <div>
      <h1 className="font-display text-[2.1rem] leading-none mb-4" style={{ color: "var(--ink-strong)" }}>Impact · kidney program</h1>
      <div className="mb-4 rounded-[10px] border px-4 py-3 text-sm" role="note" style={{ borderColor: organ === "liver" ? "#ecd9b4" : "var(--line)", background: organ === "liver" ? "var(--warn-soft)" : "var(--surface)" }}>
        This simulated year models the <strong>kidney</strong> program only (<code>data/generated/sim_results.json</code>). There is no simulated year for the liver program in this build{organ === "liver" ? ", so nothing on this page describes liver exchanges" : ""}.
      </div>
      <PageIntro id="impact" what={<>A simulated year of a national kidney pool, run 20 times under four ways of matching. All numbers are synthetic and measured by us.</>} />
      {sim.error && !d ? <ErrorState error={sim.error} onRetry={sim.reload} what="the simulation results" /> :
        !d ? <Loading rows={5} /> : !d.ready ? <EmptyState title="No simulation results yet">Run <code>python -m swapnet.sim.lab --runs 20</code> in the backend, then refresh.</EmptyState> : <Results d={d} />}
    </div>
  );
}

function Results({ d }: { d: Sim }) {
  const pols = d.policies.map((k) => ({ key: k, ...d.results[k] }));
  const base = d.results.alone_2way.transplants[0];
  const ours = d.results[OURS];
  const blind = d.results.shared_3way_blind;
  const max = Math.ceil(Math.max(...pols.map((p) => p.transplants[2])) / 50) * 50;
  const [hover, setHover] = useState<string | null>(null);
  const r = (x: number) => Math.round(x);

  return (
    <div className="space-y-10">
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          [`+${r(100 * (ours.transplants[0] / base - 1))}%`, "more transplants with a shared pool than each hospital working alone"],
          [`${r(100 * (1 - ours.tests_wasted[0] / blind.tests_wasted[0]))}% fewer`, "lab tests wasted on swaps that break, compared with a matcher that ignores failures"],
          [`${r(ours.loops_repaired[0])} a year`, "broken swaps repaired with a nearby family instead of being lost"],
        ].map(([v, t]) => (
          <div key={t} className="panel px-5 py-4">
            <p className="font-display text-[2rem] leading-none" style={{ color: "var(--forest)" }}>{v}</p>
            <p className="mt-2 text-sm muted">{t}</p>
          </div>
        ))}
      </div>

      <Section title="Transplants in a simulated year" description={`Average of ${d.runs} runs of ${d.weeks} weeks. The thin line on each bar is the 95% range across runs.`}>
        <div className="panel p-5" role="img" aria-label={pols.map((p) => `${p.title}: ${r(p.transplants[0])} transplants`).join(". ")}>
          <ul className="space-y-5">
            {pols.map((p) => {
              const [m, lo, hi] = p.transplants;
              const hot = hover === p.key;
              return (
                <li key={p.key} onMouseEnter={() => setHover(p.key)} onMouseLeave={() => setHover(null)} className="relative">
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <p><span className="font-semibold" style={{ color: "var(--ink-strong)" }}>{p.key === OURS ? "KindRed" : p.title}</span> <span className="muted">· {p.subtitle}</span></p>
                    <span className="font-semibold tnum" style={{ color: "var(--ink-strong)" }}>{r(m)}</span>
                  </div>
                  <div className="relative mt-1.5 h-5">
                    <div className="absolute inset-y-0 left-0 rounded-r-[4px]" style={{ width: `${(m / max) * 100}%`, background: p.key === OURS ? "var(--forest-mid)" : "var(--sage)", outline: hot ? "2px solid var(--forest)" : undefined }} />
                    <div className="absolute top-1/2 h-[2px]" style={{ left: `${(lo / max) * 100}%`, width: `${((hi - lo) / max) * 100}%`, background: "var(--ink-strong)", opacity: 0.55 }} />
                    {[lo, hi].map((v) => <div key={v} className="absolute top-1 bottom-1 w-[2px]" style={{ left: `${(v / max) * 100}%`, background: "var(--ink-strong)", opacity: 0.55 }} />)}
                  </div>
                  {hot && (
                    <div className="absolute right-0 -top-14 z-10 rounded-lg px-3 py-2 text-xs shadow-lg" style={{ background: "var(--forest-deep)", color: "#E6F0EA" }}>
                      {r(m)} transplants (95% range {r(lo)}–{r(hi)}) · {r(p.tests_wasted[0])} wasted tests · median wait {p.median_weeks[0].toFixed(1)} weeks
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          <div className="mt-4 flex justify-between text-xs muted tnum"><span>0</span><span>{max / 2}</span><span>{max} transplants</span></div>
        </div>
      </Section>

      <Section title="Every measure, side by side" description="Better is: more transplants, more hard-to-match patients matched, fewer wasted tests, shorter waits.">
        <div className="panel overflow-x-auto">
          <table className="table">
            <thead><tr><th>Policy</th><th className="text-right">Transplants</th><th className="text-right">Blood group O patients matched</th><th className="text-right"><Term k="cpra">Highly sensitised</Term> matched</th><th className="text-right">Wasted lab tests</th><th className="text-right">Median wait</th><th className="text-right"><Term k="repair">Repairs</Term></th></tr></thead>
            <tbody>
              {pols.map((p) => (
                <tr key={p.key} style={{ background: p.key === OURS ? "var(--sage-pale)" : undefined }}>
                  <td><span className="font-semibold" style={{ color: "var(--ink-strong)" }}>{p.key === OURS ? "KindRed" : p.title}</span><span className="block text-xs muted">{p.subtitle}</span></td>
                  <td className="text-right tnum">{r(p.transplants[0])}</td>
                  <td className="text-right tnum">{p.o_matched_pct[0].toFixed(1)}%</td>
                  <td className="text-right tnum">{p.hs_matched_pct[0].toFixed(1)}%</td>
                  <td className="text-right tnum">{r(p.tests_wasted[0])}</td>
                  <td className="text-right tnum">{p.median_weeks[0].toFixed(1)} wk</td>
                  <td className="text-right tnum">{r(p.loops_repaired[0])}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <ul className="mt-3 text-sm muted space-y-1 list-disc pl-5">
          <li>KindRed and the failure-blind 3-way matcher get the same number of transplants (their ranges overlap). KindRed&rsquo;s gain is fewer wasted tests, faster matches and repairs.</li>
          <li>KindRed matches fewer highly sensitised patients ({ours.hs_matched_pct[0].toFixed(0)}% vs {blind.hs_matched_pct[0].toFixed(0)}%), because their links fail more often. This is a known trade-off of failure-aware matching that we haven&rsquo;t solved yet.</li>
        </ul>
      </Section>

      <Section title="Can we trust the generator?" description="Before reporting anything, the synthetic pool generator must reproduce a published result (Saidman et al., 2006, 100 pairs).">
        <div className="panel overflow-hidden max-w-2xl">
          <table className="table">
            <thead><tr><th>Share of pairs matched</th><th className="text-right">Published</th><th className="text-right">Our generator (95% range)</th></tr></thead>
            <tbody>
              {[["With 2-way swaps only", d.validation.published_2way, d.validation.saidman_2way], ["With 2-way and 3-way swaps", d.validation.published_3way, d.validation.saidman_3way]].map(([k, pub, ours]: any) => (
                <tr key={k}><td>{k}</td><td className="text-right tnum">{pub}%</td><td className="text-right tnum">{ours[0]}% ({ours[1]}–{ours[2]})</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}

"use client";
import Link from "next/link";
import { PageIntro } from "@/components/app/Help";
import { EmptyState, ErrorState, Kpis, Loading, OrganTag, PageHeader, Section, Tag } from "@/components/app/ui";
import { useResource } from "@/lib/data/source";
import { useProgram } from "@/lib/program";
import type { Integrity, IntegrityFinding } from "@/lib/data/types";

const SEV: Record<string, { tone: "bad" | "warn" | "neutral"; label: string }> = {
  error: { tone: "bad", label: "Error" }, warn: { tone: "warn", label: "Needs review" }, info: { tone: "neutral", label: "Info" },
};
const label = (check: string) => check.replace(/_/g, " ").replace(/^committee /, "committee: ");

function Ref({ f }: { f: IntegrityFinding }) {
  if (/^[SL]-\d{4}$/.test(f.ref)) return <Link className="font-semibold hover:underline" style={{ color: "var(--forest)" }} href={`/swaps/${f.ref}`}>{f.ref}</Link>;
  if (/^P-\d{4}$/.test(f.ref)) return <Link className="font-semibold hover:underline" style={{ color: "var(--forest)" }} href={`/pool?pair=${f.ref}`}>{f.ref}</Link>;
  return <span className="font-semibold">{f.ref}</span>;
}

function Findings({ rows, showOrgan }: { rows: IntegrityFinding[]; showOrgan: boolean }) {
  if (rows.length === 0) return <EmptyState title="No findings">Every check in this group passed.</EmptyState>;
  return (
    <div className="panel overflow-x-auto">
      <table className="table">
        <thead><tr><th>Check</th><th>Reference</th>{showOrgan && <th>Program</th>}<th>Finding</th><th>Severity</th></tr></thead>
        <tbody>
          {rows.map((f, i) => (
            <tr key={`${f.check}-${f.ref}-${i}`}>
              <td className="text-sm whitespace-nowrap">{label(f.check)}</td>
              <td className="text-sm whitespace-nowrap tnum"><Ref f={f} /></td>
              {showOrgan && <td>{f.organ ? <OrganTag organ={f.organ} /> : <span className="muted">–</span>}</td>}
              <td className="text-sm min-w-[18rem]">{f.detail}</td>
              <td><Tag tone={SEV[f.severity]?.tone ?? "neutral"}>{SEV[f.severity]?.label ?? f.severity}</Tag></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function IntegrityPage() {
  const { organ, view } = useProgram();
  const res = useResource<Integrity>(`integrity:${organ ?? "all"}`, (a) => a.integrity(organ), 10000);
  const d = res.data;
  const shared = (d?.findings ?? []).filter((f) => f.scope === "shared");
  const specific = (d?.findings ?? []).filter((f) => f.scope !== "shared");
  return (
    <div>
      <PageHeader title={view ? `${view.label} integrity checks` : "Integrity checks"}
/>
      <PageIntro id="integrity" what={<>Checks that the data and the workflow make sense, for example no swap mixes kidney and liver. They point a person to something to look at; they never judge a patient.</>} />
      {res.error && !d ? <ErrorState error={res.error} onRetry={res.reload} what="the integrity checks" /> : !d ? <Loading rows={6} /> : (
        <>
          <div className="mb-8">
            <Kpis items={[
              { label: "Errors", value: d.counts.error ?? 0, sub: "data or workflow that is wrong", tone: d.counts.error ? "bad" : undefined },
              { label: "Needs review", value: d.counts.warn ?? 0, sub: "open reviews and pending tests", tone: d.counts.warn ? "warn" : undefined },
              { label: "Shared checks", value: shared.length, sub: "findings from Q27_integrity_shared" },
              { label: "Program checks", value: specific.length, sub: view ? `findings from the ${view.label.toLowerCase()} module` : "findings from both organ modules" },
            ]} />
          </div>
          <div className="space-y-10">
            <Section title="Shared checks" description="References, links, program isolation, evidence and approvals. The same for every program.">
              <Findings rows={shared} showOrgan={!view} />
            </Section>
            <Section title={view ? `${view.label} program checks` : "Program checks"} description="From each organ module's own checks and its committee checklist.">
              <Findings rows={specific} showOrgan={!view} />
            </Section>
          </div>
          <p className="mt-4 text-xs muted">{d.note}</p>
        </>
      )}
    </div>
  );
}

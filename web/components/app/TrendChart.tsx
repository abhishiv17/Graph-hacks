"use client";
// One patient's readings over time (eGFR or MELD), with the program's thresholds as reference lines. A single series,
// so the title names it and there is no legend. Hover snaps to the nearest reading; a table view sits underneath.
import { useEffect, useMemo, useRef, useState } from "react";
import type { PersonaFinding, PersonaReading } from "@/lib/data/types";

const DAY = 86_400_000;
const fmt = (ms: number) => new Date(ms).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

export default function TrendChart({ readings, thresholds, findings, label, unit, color, worse }: {
  readings: PersonaReading[]; thresholds: { value: number; label: string }[]; findings: PersonaFinding[];
  label: string; unit: string; color: string; worse: "down" | "up";
}) {
  const box = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(720);
  const [hover, setHover] = useState<number | null>(null);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(300, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const h = 260, pad = { l: 36, r: w < 520 ? 12 : 168, t: 14, b: 28 };
  const g = useMemo(() => {
    const xs = readings.map((r) => r.at);
    const x0 = Math.min(...xs) - 7 * DAY, x1 = Math.max(...xs) + 7 * DAY;
    const vs = [...readings.map((r) => r.value), ...thresholds.map((t) => t.value)];
    const y0 = Math.floor(Math.min(...vs) / 5) * 5 - 2, y1 = Math.ceil(Math.max(...vs) / 5) * 5 + 2;
    const sx = (t: number) => pad.l + ((t - x0) / (x1 - x0)) * (w - pad.l - pad.r);
    const sy = (v: number) => pad.t + (1 - (v - y0) / (y1 - y0)) * (h - pad.t - pad.b);
    const ticks: number[] = [];
    for (let v = Math.ceil(y0 / 5) * 5; v <= y1; v += 5) ticks.push(v);
    const months: number[] = [];
    const d = new Date(x0); d.setDate(1); d.setMonth(d.getMonth() + 1);
    for (; d.getTime() < x1; d.setMonth(d.getMonth() + 1)) months.push(d.getTime());
    return { sx, sy, ticks, months, y0, y1 };
  }, [readings, thresholds, w, pad.l, pad.r, pad.t, pad.b]);

  if (!readings.length) return null;
  const changes = new Map(findings.filter((f) => f.kind === "stage_change").map((f) => [f.at, f]));
  const path = readings.map((r, i) => `${i ? "L" : "M"}${g.sx(r.at).toFixed(1)},${g.sy(r.value).toFixed(1)}`).join("");
  const worst = thresholds[thresholds.length - 1]; // thresholds come ordered from mild to most serious
  const hr = hover !== null ? readings[hover] : null;
  const hf = hr ? findings.find((f) => f.at === hr.at && f.kind !== "baseline") : null;

  const onMove = (e: React.PointerEvent<SVGRectElement>) => {
    const rect = (e.target as SVGRectElement).getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * (w - pad.l - pad.r) + pad.l;
    let best = 0;
    readings.forEach((r, i) => { if (Math.abs(g.sx(r.at) - x) < Math.abs(g.sx(readings[best].at) - x)) best = i; });
    setHover(best);
  };

  return (
    <div>
      <div ref={box} className="relative">
        <svg width={w} height={h} role="img" aria-label={`${label} over time: ${readings.map((r) => `${r.value} on ${fmt(r.at)}`).join(", ")}`}>
          {/* The zone past the most serious threshold, kept quiet: a tint, not an alarm. */}
          {worst && (worse === "down"
            ? <rect x={pad.l} y={g.sy(worst.value)} width={w - pad.l - pad.r} height={h - pad.b - g.sy(worst.value)} fill="var(--bad-soft)" />
            : <rect x={pad.l} y={pad.t} width={w - pad.l - pad.r} height={g.sy(worst.value) - pad.t} fill="var(--bad-soft)" />)}
          {g.ticks.map((v) => (
            <g key={v}>
              <line x1={pad.l} x2={w - pad.r} y1={g.sy(v)} y2={g.sy(v)} stroke="var(--line)" strokeWidth={1} />
              <text x={pad.l - 8} y={g.sy(v) + 4} textAnchor="end" fontSize={11} fill="var(--muted)" className="tnum">{v}</text>
            </g>
          ))}
          {g.months.map((m) => (
            <text key={m} x={g.sx(m)} y={h - 8} textAnchor="middle" fontSize={11} fill="var(--muted)">
              {new Date(m).toLocaleDateString("en-GB", { month: "short" })}
            </text>
          ))}
          {thresholds.map((t) => (
            <g key={t.value}>
              <line x1={pad.l} x2={w - pad.r} y1={g.sy(t.value)} y2={g.sy(t.value)} stroke="var(--ink)" strokeOpacity={0.55} strokeWidth={1} strokeDasharray="4 4" />
              {w >= 520 && <text x={w - pad.r + 8} y={g.sy(t.value) + 4} fontSize={11} fill="var(--ink)">{t.label}</text>}
            </g>
          ))}
          {[...changes.values()].map((f) => (
            <line key={f.finding_id} x1={g.sx(f.at)} x2={g.sx(f.at)} y1={pad.t} y2={h - pad.b} stroke="var(--warn-mark)" strokeWidth={1.5} strokeDasharray="2 3" />
          ))}
          <path d={path} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          {hr && <line x1={g.sx(hr.at)} x2={g.sx(hr.at)} y1={pad.t} y2={h - pad.b} stroke="var(--ink)" strokeOpacity={0.35} strokeWidth={1} />}
          {readings.map((r, i) => {
            const fresh = r.week > 0;
            return (
              <circle key={r.result_id} cx={g.sx(r.at)} cy={g.sy(r.value)} r={hover === i ? 6 : 4.5}
                      fill={fresh ? color : "var(--surface)"} stroke={fresh ? "var(--surface)" : color} strokeWidth={2} />
            );
          })}
          {/* Direct label on the latest reading only. */}
          {(() => {
            const r = readings[readings.length - 1];
            return <text x={g.sx(r.at)} y={g.sy(r.value) - 12} textAnchor="middle" fontSize={12} fontWeight={600} fill="var(--ink-strong)" className="tnum">{r.value}</text>;
          })()}
          <rect x={pad.l} y={pad.t} width={w - pad.l - pad.r} height={h - pad.t - pad.b} fill="transparent"
                onPointerMove={onMove} onPointerLeave={() => setHover(null)} />
        </svg>
        {hr && (
          <div className="pointer-events-none absolute z-10 rounded-lg border px-3 py-2 text-xs shadow-sm max-w-[16rem]"
               style={{ left: Math.min(g.sx(hr.at) + 12, w - 220), top: 8, background: "var(--surface)", borderColor: "var(--line)" }}>
            <p className="muted">{fmt(hr.at)} · {hr.week > 0 ? `demo week ${hr.week}` : "on file"}</p>
            <p className="font-semibold tnum" style={{ color: "var(--ink-strong)" }}>{label} {hr.value} <span className="muted font-normal">{unit}</span></p>
            {hf && <p className="mt-1" style={{ color: "var(--ink)" }}>{hf.kind === "stage_change" ? "Stage changed. " : ""}{hf.text.split(". ")[0]}.</p>}
          </div>
        )}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs muted">
        <span className="inline-flex items-center gap-1.5"><svg width="10" height="10"><circle cx="5" cy="5" r="3.5" fill="var(--surface)" stroke={color} strokeWidth="2" /></svg>On file (last six months)</span>
        <span className="inline-flex items-center gap-1.5"><svg width="10" height="10"><circle cx="5" cy="5" r="4" fill={color} /></svg>New during this demo</span>
        <span className="inline-flex items-center gap-1.5"><svg width="14" height="10"><line x1="7" x2="7" y1="0" y2="10" stroke="var(--warn-mark)" strokeWidth="1.5" strokeDasharray="2 3" /></svg>Stage changed</span>
      </div>
      <details className="mt-2 text-sm">
        <summary className="cursor-pointer muted text-xs">Show as a table</summary>
        <table className="mt-2 w-full text-sm">
          <thead><tr className="text-left label"><th className="py-1 pr-4">Date</th><th className="py-1 pr-4">{label} ({unit})</th><th className="py-1">Source</th></tr></thead>
          <tbody>
            {readings.map((r) => (
              <tr key={r.result_id} className="border-t" style={{ borderColor: "var(--line)" }}>
                <td className="py-1 pr-4">{fmt(r.at)}</td><td className="py-1 pr-4 tnum">{r.value}</td>
                <td className="py-1 muted">{r.week > 0 ? `Demo week ${r.week}` : "On file"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}

"use client";
// A small India map for one patient: their hospital, the hospitals of the families a search found, and the donations
// of their swap as arrows (donor's city → patient's city). Same projection as the live map.
import { useMemo } from "react";
import { INDIA, MAP_H, MAP_W, project } from "@/lib/india-map";

type Place = { code: string; city: string; lat: number; lon: number };
export type MiniLink = { from: string; to: string };

export default function MiniMap({ places, home, links = [], lit = [], color, label }: {
  places: Record<string, Place>; home: string; links?: MiniLink[]; lit?: string[]; color: string; label: string;
}) {
  const xy = useMemo(() => Object.fromEntries(Object.entries(places).map(([k, p]) => [k, project(p.lon, p.lat)])), [places]);
  const cities = useMemo(() => {
    // One dot per hospital, even when several families there are on the map.
    const by = new Map<string, { code: string; city: string; pt: [number, number]; pairs: string[] }>();
    for (const [pid, p] of Object.entries(places)) {
      const c = by.get(p.code) ?? { code: p.code, city: p.city, pt: xy[pid] as [number, number], pairs: [] };
      c.pairs.push(pid);
      by.set(p.code, c);
    }
    return [...by.values()];
  }, [places, xy]);
  const homeCode = places[home]?.code;
  const litCodes = new Set(lit.map((p) => places[p]?.code).filter(Boolean));
  const linkCodes = new Set(links.flatMap((l) => [places[l.from]?.code, places[l.to]?.code]).filter(Boolean));

  const arc = (a: [number, number], b: [number, number]) => {
    const [mx, my] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
    const k = 0.22;  // bend, so a 2-way swap shows two separate arrows
    return `M${a[0]},${a[1]} Q${mx - dy * k},${my + dx * k} ${b[0]},${b[1]}`;
  };

  return (
    <svg viewBox={`40 0 ${MAP_W - 60} ${MAP_H - 20}`} className="w-full h-auto" role="img" aria-label={label}>
      <defs>
        <marker id="mm-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 Z" fill={color} />
        </marker>
      </defs>
      <path d={INDIA} fill="var(--sage-pale)" stroke="var(--line-strong)" strokeWidth={2} />
      {links.map((l, i) => {
        const a = xy[l.from], b = xy[l.to];
        if (!a || !b) return null;
        return <path key={i} d={arc(a as [number, number], b as [number, number])} fill="none" stroke={color} strokeWidth={6}
                     strokeLinecap="round" markerEnd="url(#mm-arrow)" className="mm-link" style={{ animationDelay: `${i * 0.25}s` }} />;
      })}
      {cities.map((c) => {
        const on = c.code === homeCode || linkCodes.has(c.code) || litCodes.has(c.code);
        return (
          <g key={c.code} opacity={on ? 1 : 0.35}>
            {litCodes.has(c.code) && c.code !== homeCode && <circle cx={c.pt[0]} cy={c.pt[1]} r={30} fill={color} opacity={0.18} className="mm-pulse" />}
            <circle cx={c.pt[0]} cy={c.pt[1]} r={c.code === homeCode ? 16 : 11} fill={c.code === homeCode ? color : "var(--surface)"}
                    stroke={color} strokeWidth={5} />
            <text x={c.pt[0] + 22} y={c.pt[1] + 10} fontSize={34} fontWeight={c.code === homeCode ? 700 : 500} fill="var(--ink-strong)">{c.city}</text>
          </g>
        );
      })}
      <style>{`
        .mm-link { stroke-dasharray: 1400; stroke-dashoffset: 1400; animation: mm-draw 0.9s ease-out forwards; }
        .mm-pulse { animation: mm-pulse 1.4s ease-in-out infinite; }
        @keyframes mm-draw { to { stroke-dashoffset: 0; } }
        @keyframes mm-pulse { 50% { opacity: 0.05; } }
        @media (prefers-reduced-motion: reduce) { .mm-link { animation: none; stroke-dashoffset: 0; } .mm-pulse { animation: none; } }
      `}</style>
    </svg>
  );
}

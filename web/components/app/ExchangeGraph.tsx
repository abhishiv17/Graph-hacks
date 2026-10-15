"use client";
// A swap loop on a dark canvas: families (nodes) and donations (arrows). Live links carry a moving current,
// failed links pulse coral and are labelled, proposals are dashed mint, fallbacks dotted.

export type GNode = { id: string; title: string; sub?: string; state?: "active" | "released" | "candidate" | "joined" | "dim"; x?: number; y?: number };
export type GEdge = { from: string; to: string; state: "viable" | "failed" | "fallback" | "proposed" | "inactive" | "pending"; label?: string; key?: string };

const EDGE: Record<GEdge["state"], { stroke: string; dash?: string; width: number; marker: string; flow?: boolean; pulse?: boolean }> = {
  viable: { stroke: "#A6D8B5", width: 3, marker: "v", flow: true },
  pending: { stroke: "#7FAE93", width: 2.2, dash: "2 7", marker: "p" },
  proposed: { stroke: "#D6F0DE", width: 3, dash: "10 7", marker: "v", flow: true },
  failed: { stroke: "#E08A80", width: 3, dash: "7 6", marker: "f", pulse: true },
  fallback: { stroke: "#6F8F80", width: 2, dash: "2 6", marker: "m" },
  inactive: { stroke: "#355B4E", width: 2, marker: "m" },
};
const NODE: Record<NonNullable<GNode["state"]>, { fill: string; stroke: string; text: string; sub: string; dash?: string; halo?: string }> = {
  active: { fill: "#F7F6F0", stroke: "#A6D8B5", text: "#183B32", sub: "#4A5952" },
  joined: { fill: "#A6D8B5", stroke: "#F7F6F0", text: "#102A24", sub: "#183B32", halo: "rgba(166,216,181,0.22)" },
  released: { fill: "#3A2522", stroke: "#E08A80", text: "#F6D6D1", sub: "#E9B5AE" },
  candidate: { fill: "#0F2621", stroke: "#D6F0DE", text: "#F7F6F0", sub: "#A9BFB2", dash: "5 5", halo: "rgba(214,240,222,0.14)" },
  dim: { fill: "#163830", stroke: "#2F5A4C", text: "#7E9A8B", sub: "#6A8678" },
};

export default function ExchangeGraph({ nodes, edges, selected, onSelectEdge, height = 320, label, idPrefix = "g" }: {
  nodes: GNode[]; edges: GEdge[]; selected?: string | null; onSelectEdge?: (key: string) => void; height?: number; label: string; idPrefix?: string;
}) {
  const W = 560, H = 360, cx = W / 2, cy = H / 2 + 6, R = 128;
  const ring = nodes.filter((n) => n.x === undefined);
  const pos = new Map<string, [number, number]>();
  ring.forEach((n, i) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / ring.length;
    pos.set(n.id, [cx + R * 1.45 * Math.cos(a), cy + (R - 6) * Math.sin(a)]);
  });
  nodes.forEach((n) => { if (n.x !== undefined) pos.set(n.id, [n.x, n.y ?? cy]); });
  const NR = 38;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ maxHeight: height }} className="w-full h-auto" role="img" aria-label={label}>
      <defs>
        {[["v", "#A6D8B5"], ["f", "#E08A80"], ["m", "#6F8F80"], ["p", "#7FAE93"]].map(([k, c]) => (
          <marker key={k} id={`${idPrefix}-${k}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill={c} />
          </marker>
        ))}
        <filter id={`${idPrefix}-glow`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3" result="b" />
          <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      {edges.map((e, i) => {
        const a = pos.get(e.from), b = pos.get(e.to);
        if (!a || !b) return null;
        const key = e.key ?? `${e.from}>${e.to}`;
        const dx = b[0] - a[0], dy = b[1] - a[1], n = Math.hypot(dx, dy) || 1;
        const bend = e.state === "fallback" ? -34 : 26;
        const mx = (a[0] + b[0]) / 2 - (dy / n) * bend, my = (a[1] + b[1]) / 2 + (dx / n) * bend;
        const t = (p: [number, number], q: [number, number]) => { const d = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1; return [p[0] + ((q[0] - p[0]) / d) * (NR + 5), p[1] + ((q[1] - p[1]) / d) * (NR + 5)]; };
        const s = t(a, [mx, my]), f = t(b, [mx, my]);
        const st = EDGE[e.state];
        const sel = selected === key;
        const d = `M${s[0]},${s[1]} Q${mx},${my} ${f[0]},${f[1]}`;
        const lx = 0.25 * s[0] + 0.5 * mx + 0.25 * f[0], ly = 0.25 * s[1] + 0.5 * my + 0.25 * f[1];
        return (
          <g key={key + i} onClick={() => onSelectEdge?.(key)} style={{ cursor: onSelectEdge ? "pointer" : undefined }}
             role={onSelectEdge ? "button" : undefined} tabIndex={onSelectEdge ? 0 : undefined} aria-label={onSelectEdge ? `Inspect link ${e.label ?? key}` : undefined}
             onKeyDown={(ev) => { if (onSelectEdge && (ev.key === "Enter" || ev.key === " ")) { ev.preventDefault(); onSelectEdge(key); } }}>
            <path d={d} fill="none" stroke="transparent" strokeWidth={20} />
            {sel && <path d={d} fill="none" stroke="#F7F6F0" strokeWidth={st.width + 8} strokeLinecap="round" opacity={0.18} />}
            <path d={d} fill="none" stroke={st.stroke} strokeWidth={st.width} strokeDasharray={st.dash} strokeLinecap="round"
                  markerEnd={`url(#${idPrefix}-${st.marker})`} className={st.pulse ? "pulse-bad" : undefined} filter={st.flow ? `url(#${idPrefix}-glow)` : undefined} />
            {st.flow && <path d={d} fill="none" stroke="#FFFFFF" strokeWidth={1.8} strokeLinecap="round" className={e.state === "proposed" ? "flow-slow" : "flow"} opacity={0.85} />}
            {e.label && (
              <g transform={`translate(${lx} ${ly})`}>
                <rect x={-e.label.length * 3.4 - 9} y={-11.5} width={e.label.length * 6.8 + 18} height={23} rx={11.5}
                      fill={e.state === "failed" ? "#3A2522" : "#0B1E19"} stroke={e.state === "failed" ? "#E08A80" : "#2F5A4C"} />
                <text y={4} textAnchor="middle" fontSize={11.5} fontWeight={600} fill={e.state === "failed" ? "#F6D6D1" : "#CFE3D6"} style={{ fontFamily: "var(--font-sans)" }}>{e.label}</text>
              </g>
            )}
          </g>
        );
      })}
      {nodes.map((n) => {
        const p = pos.get(n.id)!;
        const st = NODE[n.state ?? "active"];
        return (
          <g key={n.id} transform={`translate(${p[0]} ${p[1]})`}>
            {st.halo && <circle r={NR + 10} fill={st.halo} />}
            <circle r={NR} fill={st.fill} stroke={st.stroke} strokeWidth={2.2} strokeDasharray={st.dash} />
            <text y={-1} textAnchor="middle" fontSize={12.5} fontWeight={700} fill={st.text} style={{ fontFamily: "var(--font-sans)" }}>{n.title}</text>
            {n.sub && <text y={14} textAnchor="middle" fontSize={10.5} fontWeight={500} fill={st.sub} style={{ fontFamily: "var(--font-sans)" }}>{n.sub}</text>}
          </g>
        );
      })}
    </svg>
  );
}

export function GraphLegend({ items }: { items: GEdge["state"][] }) {
  const L: Record<GEdge["state"], string> = { viable: "Live link", pending: "Test pending", proposed: "Proposed repair", failed: "Failed link", fallback: "Fallback", inactive: "Inactive" };
  return (
    <ul className="flex flex-wrap gap-x-5 gap-y-1 text-xs" style={{ color: "#A9BFB2" }}>
      {items.map((k) => (
        <li key={k} className="flex items-center gap-2">
          <svg width="26" height="8" aria-hidden="true"><path d="M1 4 H25" stroke={EDGE[k].stroke} strokeWidth={EDGE[k].width} strokeDasharray={EDGE[k].dash} strokeLinecap="round" /></svg>
          {L[k]}
        </li>
      ))}
    </ul>
  );
}

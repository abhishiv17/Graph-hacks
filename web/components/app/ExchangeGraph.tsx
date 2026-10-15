"use client";
// A swap loop: each family is drawn as its patient and donor (Kin's relatives), each donation as an arrow coloured by
// where it stands. Passed links flow green, pending tests are amber dashes, a failed link pulses coral, a proposed
// repair flows teal and the stored 2-way fallback is a grey dotted line. Each arrow carries its chance as a pill.
import { FamilyGlyph } from "@/components/Kin";

export type GNode = { id: string; title: string; sub?: string; state?: "active" | "released" | "candidate" | "joined" | "dim"; x?: number; y?: number };
export type GEdge = { from: string; to: string; state: "viable" | "failed" | "fallback" | "proposed" | "inactive" | "pending"; label?: string; key?: string };

const EDGE: Record<GEdge["state"], { stroke: string; dash?: string; width: number; flow?: boolean; pulse?: boolean; name: string }> = {
  viable: { stroke: "#2C8A62", width: 3.2, flow: true, name: "Test passed" },
  pending: { stroke: "#D99A35", width: 2.6, dash: "6 6", name: "Test pending" },
  proposed: { stroke: "#2A8C9E", width: 3, dash: "10 7", flow: true, name: "Proposed repair" },
  failed: { stroke: "#D4574B", width: 3.2, dash: "7 6", pulse: true, name: "Failed link" },
  fallback: { stroke: "#8A9A90", width: 2.2, dash: "2 6", name: "2-way fallback" },
  inactive: { stroke: "#C3CEC6", width: 2, name: "Not needed" },
};
const NODE: Record<NonNullable<GNode["state"]>, { ring: string; fill: string; dash?: string; badge?: string; badgeFill?: string; fade?: number }> = {
  active: { ring: "#2C5A4B", fill: "#FFFFFF" },
  joined: { ring: "#2A8C9E", fill: "#E8F5F3", badge: "joined", badgeFill: "#2A8C9E" },
  released: { ring: "#D4574B", fill: "#FBEDEB", dash: "5 4", badge: "released", badgeFill: "#D4574B" },
  candidate: { ring: "#2A8C9E", fill: "#FFFFFF", dash: "6 5", badge: "would join", badgeFill: "#2A8C9E" },
  dim: { ring: "#C3CEC6", fill: "#F4F6F3", fade: 0.55 },
};

export default function ExchangeGraph({ nodes, edges, selected, onSelectEdge, onSelectNode, height = 320, label, idPrefix = "g" }: {
  nodes: GNode[]; edges: GEdge[]; selected?: string | null; onSelectEdge?: (key: string) => void; onSelectNode?: (id: string) => void;
  height?: number; label: string; idPrefix?: string;
}) {
  const W = 560, H = 380, cx = W / 2, cy = H / 2 + 4, R = 128;
  const ring = nodes.filter((n) => n.x === undefined);
  const pos = new Map<string, [number, number]>();
  ring.forEach((n, i) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / ring.length;
    pos.set(n.id, [cx + R * 1.45 * Math.cos(a), cy + (R - 4) * Math.sin(a)]);
  });
  nodes.forEach((n) => { if (n.x !== undefined) pos.set(n.id, [n.x, n.y ?? cy]); });
  const NR = 40;
  const pid = (n: GNode) => (/^P-\d+/i.test(n.sub ?? "") ? n.sub! : /^P-\d+/i.test(n.id) ? n.id : n.id);

  return (
    <svg viewBox={`0 -8 ${W} ${H + 40}`} style={{ maxHeight: height }} className="w-full h-auto" role="img" aria-label={label}>
      <defs>
        {(Object.keys(EDGE) as GEdge["state"][]).map((k) => (
          <marker key={k} id={`${idPrefix}-${k}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill={EDGE[k].stroke} />
          </marker>
        ))}
        <radialGradient id={`${idPrefix}-bg`} cx="50%" cy="50%" r="65%">
          <stop offset="0%" stopColor="#F2F7F1" /><stop offset="100%" stopColor="#FBFAF6" />
        </radialGradient>
      </defs>
      <rect y={-8} width={W} height={H + 40} rx={14} fill={`url(#${idPrefix}-bg)`} />
      <ellipse cx={cx} cy={cy} rx={R * 1.45} ry={R - 4} fill="none" stroke="#DCE6DD" strokeDasharray="3 7" />
      {edges.map((e, i) => {
        const a = pos.get(e.from), b = pos.get(e.to);
        if (!a || !b) return null;
        const key = e.key ?? `${e.from}>${e.to}`;
        const dx = b[0] - a[0], dy = b[1] - a[1], n = Math.hypot(dx, dy) || 1;
        const bend = e.state === "fallback" ? -38 : 28;
        const mx = (a[0] + b[0]) / 2 - (dy / n) * bend, my = (a[1] + b[1]) / 2 + (dx / n) * bend;
        const t = (p: [number, number], q: [number, number]) => { const d = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1; return [p[0] + ((q[0] - p[0]) / d) * (NR + 6), p[1] + ((q[1] - p[1]) / d) * (NR + 6)]; };
        const s = t(a, [mx, my]), f = t(b, [mx, my]);
        const st = EDGE[e.state];
        const sel = selected === key;
        const d = `M${s[0]},${s[1]} Q${mx},${my} ${f[0]},${f[1]}`;
        const lx = 0.25 * s[0] + 0.5 * mx + 0.25 * f[0], ly = 0.25 * s[1] + 0.5 * my + 0.25 * f[1];
        return (
          <g key={key + i} onClick={() => onSelectEdge?.(key)} style={{ cursor: onSelectEdge ? "pointer" : undefined }}
             role={onSelectEdge ? "button" : undefined} tabIndex={onSelectEdge ? 0 : undefined} aria-label={onSelectEdge ? `Inspect link ${e.label ?? key}` : undefined}
             onKeyDown={(ev) => { if (onSelectEdge && (ev.key === "Enter" || ev.key === " ")) { ev.preventDefault(); onSelectEdge(key); } }}>
            <path d={d} fill="none" stroke="transparent" strokeWidth={22} />
            {sel && <path d={d} fill="none" stroke={st.stroke} strokeWidth={st.width + 9} strokeLinecap="round" opacity={0.18} />}
            <path d={d} fill="none" stroke={st.stroke} strokeWidth={st.width} strokeDasharray={st.dash} strokeLinecap="round"
                  markerEnd={`url(#${idPrefix}-${e.state})`} className={st.pulse ? "pulse-bad" : undefined} />
            {st.flow && <path d={d} fill="none" stroke="#FFFFFF" strokeWidth={1.6} strokeLinecap="round" className={e.state === "proposed" ? "flow-slow" : "flow"} opacity={0.9} />}
            {e.label && (
              <g transform={`translate(${lx} ${ly})`}>
                <rect x={-e.label.length * 3.4 - 10} y={-12} width={e.label.length * 6.8 + 20} height={24} rx={12}
                      fill="#FFFFFF" stroke={st.stroke} strokeWidth={sel ? 2 : 1.4} />
                <text y={4} textAnchor="middle" fontSize={11.5} fontWeight={700} fill={e.state === "inactive" ? "#7E8C84" : st.stroke} style={{ fontFamily: "var(--font-sans)" }}>{e.label}</text>
              </g>
            )}
          </g>
        );
      })}
      {nodes.map((n) => {
        const p = pos.get(n.id)!;
        const st = NODE[n.state ?? "active"];
        const click = onSelectNode ? () => onSelectNode(pid(n)) : undefined;
        return (
          <g key={n.id} transform={`translate(${p[0]} ${p[1]})`} opacity={st.fade ?? 1} onClick={click}
             style={{ cursor: click ? "pointer" : undefined }} role={click ? "button" : undefined} tabIndex={click ? 0 : undefined}
             aria-label={click ? `Open ${n.title} ${n.sub ?? ""} in the family explorer` : undefined}
             onKeyDown={(ev) => { if (click && ev.key === "Enter") click(); }}>
            <circle r={NR + 5} fill="none" stroke={st.ring} strokeWidth={1} opacity={0.25} />
            <circle r={NR} fill={st.fill} stroke={st.ring} strokeWidth={2.6} strokeDasharray={st.dash} />
            <g transform="translate(0 -3)"><FamilyGlyph id={pid(n)} size={27} /></g>
            <text y={NR + 17} textAnchor="middle" fontSize={13} fontWeight={700} fill="#1F2C27"
                  style={{ fontFamily: "var(--font-sans)", paintOrder: "stroke", stroke: "#FBFAF6", strokeWidth: 4 }}>{n.title}</text>
            {n.sub && <text y={NR + 31} textAnchor="middle" fontSize={10.5} fontWeight={500} fill="#66736B"
                            style={{ fontFamily: "var(--font-sans)", paintOrder: "stroke", stroke: "#FBFAF6", strokeWidth: 4 }}>{n.sub}</text>}
            {st.badge && (
              <g transform={`translate(0 ${-NR - 4})`}>
                <rect x={-st.badge.length * 3.3 - 8} y={-10} width={st.badge.length * 6.6 + 16} height={18} rx={9} fill={st.badgeFill} />
                <text y={3.5} textAnchor="middle" fontSize={10} fontWeight={700} fill="#fff" style={{ fontFamily: "var(--font-sans)" }}>{st.badge}</text>
              </g>
            )}
          </g>
        );
      })}
    </svg>
  );
}

export function GraphLegend({ items }: { items: GEdge["state"][] }) {
  return (
    <ul className="flex flex-wrap gap-x-5 gap-y-1 text-xs muted">
      {items.map((k) => (
        <li key={k} className="flex items-center gap-2">
          <svg width="26" height="8" aria-hidden="true"><path d="M1 4 H25" stroke={EDGE[k].stroke} strokeWidth={EDGE[k].width} strokeDasharray={EDGE[k].dash} strokeLinecap="round" /></svg>
          {EDGE[k].name}
        </li>
      ))}
    </ul>
  );
}

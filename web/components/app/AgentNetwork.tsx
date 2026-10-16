"use client";
import { useMemo, useState } from "react";
import type { AgentEdge, AgentFeedItem, AgentGraph, AgentNode } from "@/lib/data/types";

/** Where each node sits. Hospitals on the left, the shared pool in the middle, the patients' memory on the right, and
 * each agent next to the graphs it works on. Anything new lands on a ring. */
const POS: Record<string, [number, number]> = {
  hospitals: [250, 320], exchange: [500, 300], "mem:sunita": [770, 235], "mem:rajesh": [770, 400],
  intake: [105, 175], scheduler: [105, 470], health: [345, 540], liaison: [560, 560],
  matching: [330, 80], crossmatch: [520, 55], committee: [710, 70], human: [910, 85],
  coordinator: [920, 320], ask: [905, 505],
};
const W = 1010, H = 620;
export const DRIVER: Record<string, { label: string; color: string; soft: string }> = {
  model: { label: "Language model", color: "#7A6FB0", soft: "#EEEBF7" },
  rules: { label: "Rules", color: "#2C8A62", soft: "#E3F2EA" },
  person: { label: "Person", color: "#5B6B65", soft: "#ECEFEE" },
};
const EDGE: Record<AgentEdge["kind"], { color: string; dash?: string; label: string }> = {
  writes: { color: "#2C8A62", label: "writes to" },
  reads: { color: "#4E8FC4", label: "is read by" },
  hands: { color: "#D99A35", dash: "6 4", label: "hands off" },
};
const size = (n: AgentNode) => (n.type === "agent" ? [150, 46] : n.type === "graph" ? [128, 62] : [28, 28]);

function place(nodes: AgentNode[]): Record<string, [number, number]> {
  const out: Record<string, [number, number]> = {};
  const free = nodes.filter((n) => !POS[n.id] && n.type !== "task");
  free.forEach((n, i) => { const a = (i / Math.max(1, free.length)) * Math.PI * 2; out[n.id] = [W / 2 + 430 * Math.cos(a), H / 2 + 260 * Math.sin(a)]; });
  for (const n of nodes) if (POS[n.id]) out[n.id] = POS[n.id];
  // A task sits between the agent that wrote it and the one that picks it up, nudged off the straight line.
  const tasks = nodes.filter((n) => n.type === "task");
  tasks.forEach((t, i) => {
    const a = out[t.from!] ?? [W / 2, H / 2], b = out[t.to!] ?? [W / 2, H / 2];
    out[t.id] = [(a[0] + b[0]) / 2 + 30 * (i % 3 - 1), (a[1] + b[1]) / 2 + 62 + 22 * Math.floor(i / 3)];
  });
  return out;
}

/** A curved path from a's edge to b's edge, bent a little so a→b and b→a don't overlap. */
function curve(a: [number, number], b: [number, number], ra: number, rb: number) {
  const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len;
  const s: [number, number] = [a[0] + ux * ra, a[1] + uy * ra], e: [number, number] = [b[0] - ux * rb, b[1] - uy * rb];
  const bend = Math.min(60, len * 0.14);
  const c: [number, number] = [(s[0] + e[0]) / 2 - uy * bend, (s[1] + e[1]) / 2 + ux * bend];
  return { d: `M${s[0]},${s[1]} Q${c[0]},${c[1]} ${e[0]},${e[1]}`, mid: [(s[0] + 2 * c[0] + e[0]) / 4, (s[1] + 2 * c[1] + e[1]) / 4] as [number, number] };
}
const radius = (n?: AgentNode) => (!n ? 30 : n.type === "agent" ? 52 : n.type === "graph" ? 58 : 18);

/** Up to three lines of about `n` characters, for the caption over the agent that just acted. */
function wrap(text: string, n = 44): string[] {
  const words = text.split(/\s+/);
  const out: string[] = [];
  let line = "";
  let used = 0;
  for (const w of words) {
    if (line && (line + " " + w).length > n) {
      out.push(line);
      line = "";
      if (out.length === 3) break;
    }
    line = line ? line + " " + w : w;
    used += 1;
  }
  if (out.length < 3 && line) out.push(line);
  if (used < words.length) out[out.length - 1] = out[out.length - 1].replace(/\S*$/, "…");
  return out;
}

export default function AgentNetwork({ g, selected, onSelect, flash }: {
  g: AgentGraph; selected: string | null; onSelect: (id: string | null) => void; flash?: AgentFeedItem | null;
}) {
  const [hover, setHover] = useState<string | null>(null);
  const pos = useMemo(() => place(g.nodes), [g.nodes]);
  const byId = useMemo(() => Object.fromEntries(g.nodes.map((n) => [n.id, n])), [g.nodes]);
  const playing = flash?.node && pos[flash.node] ? flash.node : null;
  const focus = hover ?? selected ?? playing;
  const touches = (e: AgentEdge) => !focus || e.from === focus || e.to === focus;
  const maxN = Math.max(1, ...g.edges.map((e) => e.n));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto select-none" role="img"
         aria-label="The agents and the FalkorDB graphs they read and write. Agents never call each other: every line goes through a graph."
         onClick={() => onSelect(null)}>
      <defs>
        {Object.entries(EDGE).map(([k, v]) => (
          <marker key={k} id={`arrow-${k}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill={v.color} />
          </marker>
        ))}
      </defs>

      {g.edges.map((e, i) => {
        const a = pos[e.from], b = pos[e.to];
        if (!a || !b) return null;
        const { d } = curve(a, b, radius(byId[e.from]), radius(byId[e.to]));
        const on = touches(e);
        const st = EDGE[e.kind];
        const live = e.from === playing || byId[e.from]?.active || (byId[e.from]?.type === "task" && byId[byId[e.from]!.from!]?.active);
        return (
          <g key={i} opacity={on ? 1 : 0.12} style={{ transition: "opacity .2s" }}>
            <path d={d} fill="none" stroke={st.color} strokeWidth={1.2 + 3 * Math.log1p(e.n) / Math.log1p(maxN)}
                  strokeDasharray={st.dash} markerEnd={`url(#arrow-${e.kind})`} strokeOpacity={0.75}>
              <title>{`${byId[e.from]?.label} ${st.label} ${byId[e.to]?.label}: ${e.what.join(", ")} (${e.n})`}</title>
            </path>
            {live && on && (
              <circle r={4} fill={st.color}>
                <animateMotion dur="2.2s" repeatCount="indefinite" path={d} />
              </circle>
            )}
          </g>
        );
      })}

      {g.nodes.map((n) => {
        const p = pos[n.id];
        if (!p) return null;
        const [w, h] = size(n);
        const dim = focus && focus !== n.id && !g.edges.some((e) => (e.from === focus && e.to === n.id) || (e.to === focus && e.from === n.id));
        const sel = selected === n.id;
        const common = {
          opacity: dim ? 0.3 : 1, style: { cursor: "pointer", transition: "opacity .2s" } as React.CSSProperties,
          onMouseEnter: () => setHover(n.id), onMouseLeave: () => setHover(null),
          onClick: (ev: React.MouseEvent) => { ev.stopPropagation(); onSelect(sel ? null : n.id); },
          tabIndex: 0, role: "button", "aria-label": `${n.label}: ${n.does}`,
          onKeyDown: (ev: React.KeyboardEvent) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); onSelect(sel ? null : n.id); } },
        };
        if (n.type === "graph") {
          return (
            <g key={n.id} {...common} transform={`translate(${p[0]},${p[1]})`}>
              <ellipse cx={0} cy={-h / 2 + 9} rx={w / 2} ry={9} fill="var(--surface)" stroke="var(--forest)" strokeWidth={sel ? 2.5 : 1.4} />
              <path d={`M${-w / 2},${-h / 2 + 9} V${h / 2 - 9} A${w / 2},9 0 0 0 ${w / 2},${h / 2 - 9} V${-h / 2 + 9}`}
                    fill="var(--sage-pale)" stroke="var(--forest)" strokeWidth={sel ? 2.5 : 1.4} />
              <ellipse cx={0} cy={-h / 2 + 9} rx={w / 2} ry={9} fill="var(--surface)" stroke="var(--forest)" strokeWidth={sel ? 2.5 : 1.4} />
              <text y={6} textAnchor="middle" fontSize={13} fontWeight={700} fill="var(--ink-strong)">{n.label}</text>
              <text y={22} textAnchor="middle" fontSize={10} fill="var(--muted)" fontFamily="ui-monospace, monospace">{n.graph}</text>
            </g>
          );
        }
        if (n.type === "task") {
          return (
            <g key={n.id} {...common} transform={`translate(${p[0]},${p[1]})`}>
              <rect x={-11} y={-11} width={22} height={22} transform="rotate(45)" fill="#FBF0DC" stroke="var(--amber)" strokeWidth={sel ? 2.5 : 1.5} />
              <text y={4} textAnchor="middle" fontSize={11} fontWeight={700} fill="var(--ink-strong)">{n.n}</text>
              <text y={30} textAnchor="middle" fontSize={10.5} fill="var(--ink)">{n.label.replace(/^\d+ open: /, "")}</text>
            </g>
          );
        }
        const d = DRIVER[n.driver ?? "rules"];
        return (
          <g key={n.id} {...common} transform={`translate(${p[0]},${p[1]})`}>
            {(n.active || playing === n.id) && (
              <rect x={-w / 2 - 4} y={-h / 2 - 4} width={w + 8} height={h + 8} rx={14} fill="none" stroke={d.color} strokeWidth={2}>
                <animate attributeName="opacity" values="0.9;0.15;0.9" dur="1.8s" repeatCount="indefinite" />
              </rect>
            )}
            <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={11} fill={d.soft} stroke={d.color} strokeWidth={sel ? 2.8 : 1.5} />
            <circle cx={-w / 2 + 13} cy={-5} r={4.5} fill={d.color} />
            <text x={-w / 2 + 24} y={-1} fontSize={12.5} fontWeight={700} fill="var(--ink-strong)">{n.label}</text>
            <text x={-w / 2 + 24} y={14} fontSize={10} fill="var(--muted)">
              {n.driver === "model" ? "language model" : n.driver === "person" ? "person" : "rules"}
              {n.members?.length ? ` · ${n.members.length} hospitals` : ""}
              {n.open_tasks ? ` · ${n.open_tasks} task${n.open_tasks === 1 ? "" : "s"} waiting` : ""}
            </text>
          </g>
        );
      })}
      {playing && flash && (() => {
        const [x, y] = pos[playing];
        const lines = wrap(`${flash.agent}: ${flash.text}`);
        const w = 300, h = 14 + lines.length * 15;
        const above = y > 190;
        const bx = Math.min(W - w - 6, Math.max(6, x - w / 2)), by = above ? y - 40 - h : y + 40;
        return (
          <g pointerEvents="none" key={`${flash.at}${flash.text}`}>
            <animate attributeName="opacity" from="0" to="1" dur="0.3s" fill="freeze" />
            <rect x={bx} y={by} width={w} height={h} rx={8} fill="var(--forest)" opacity={0.95} />
            <path d={above ? `M${x - 7},${by + h} L${x},${by + h + 8} L${x + 7},${by + h} z` : `M${x - 7},${by} L${x},${by - 8} L${x + 7},${by} z`}
                  fill="var(--forest)" opacity={0.95} />
            {lines.map((l, i) => <text key={i} x={bx + 10} y={by + 18 + i * 15} fontSize={11.5} fill="#fff">{l}</text>)}
          </g>
        );
      })()}
    </svg>
  );
}

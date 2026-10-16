"use client";
// One family as a small graph, the way the graph holds it: the family breaks down into its patient and donor, their
// blood groups, the donor's tissue antigens and the patient's antibodies; the coral path shows why the family's own
// donor can't give; and the families around it come in hop by hop, with the swaps that close back to it highlighted.
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import Walkthrough from "./Walkthrough";
import { familyWalk, type WalkStep } from "@/lib/walkthrough";
import { Icon } from "./icons";
import { useResource } from "@/lib/data/source";
import type { Explore, ExploreEdge, ExploreNode, ExploreNodeType } from "@/lib/data/types";

const W = 1000, H = 640, CX = 470, CY = 320;
const TYPE: Record<ExploreNodeType, { label: string; color: string; r: number }> = {
  family: { label: "Family", color: "#2C5A4B", r: 15 },
  patient: { label: "Patient", color: "#E07A6E", r: 17 },
  donor: { label: "Donor", color: "#4E8FC4", r: 17 },
  hospital: { label: "Hospital", color: "#7A6FB0", r: 13 },
  blood: { label: "Blood group", color: "#B4443A", r: 12 },
  antigen: { label: "Tissue antigen", color: "#D99A35", r: 9 },
  antibody: { label: "Antibody", color: "#8E5BB5", r: 9 },
  liver: { label: "Liver profile", color: "#9A6A2C", r: 12 },
};
const LIVER = "#B07A2E";
const MARK: Record<string, string> = { own: "#D4574B", loop2: "#2C8A62", loop3: "#C98A1E" };
const HOP_TEXT = [
  "",
  "1 hop: the families this donor can give to (→) and the families whose donor can give to this patient (←).",
  "2 hops: out and straight back is a 2-way swap. The strongest ones are drawn in green; the outer ring is one step further.",
  "3 hops: A → B → C → back to A. Three-family swaps close at the third hop, drawn in gold; they help patients nobody can trade with directly.",
];
const PRETTY: Record<string, string> = {
  abo: "Blood group", cpra: "Sensitisation (cPRA %)", meld: "MELD score", sex: "Sex", age_band: "Age", relation: "Relation to patient",
  bmi: "BMI", untyped_loci: "Not yet typed", weight_kg: "Weight (kg)", height_cm: "Height (cm)", mfi: "Strength (MFI)",
  reacts_with: "Reacts with", locus: "Locus", status: "Status", organ: "Program", city: "City", code: "Hospital code",
  approval_state: "Committee", loop_id: "Current swap", donor_abo: "Donor blood group", patient_abo: "Patient blood group",
  liver_volume_ml: "Liver volume (ml)", left_lobe_ml: "Left lobe (ml)", right_lobe_ml: "Right lobe (ml)", volumetry: "Volumes from",
  steatosis: "Fat in liver", recipient_evaluation: "Recipient evaluation", surgical_review: "Surgical review",
  anatomy_review: "Anatomy review", donor_evaluation: "Donor evaluation", group: "Group",
};

type Pos = { x: number; y: number };

/** One plain sentence for whatever is under the pointer. Families carry the server's "why"; parts are explained here. */
function explainNode(n: ExploreNode): string {
  const d = n.data;
  switch (n.type) {
    case "patient": return `The person who needs the transplant${d.abo ? `, blood group ${d.abo}` : ""}.`;
    case "donor": return `The relative who wants to donate${d.relation ? ` (${d.relation})` : ""}, but can't give to their own patient.`;
    case "blood": return `Blood group ${d.group ?? n.label}. Blood groups decide who can give to whom.`;
    case "antigen": return `${n.label}: a tissue marker on the donor's cells. If a patient has an antibody against it, their body would reject the organ.`;
    case "antibody": return `Something in the patient's blood that attacks ${(d.reacts_with ?? []).join(", ") || "a tissue marker"} (strength ${d.mfi}). From 2000 it counts as a clash.`;
    case "hospital": return `The hospital this family is registered at. Names and papers stay here.`;
    case "liver": return `The donor's liver measurements, which decide whose body the donated part would fit.`;
    default: return n.why ?? `${n.label}, in ${d.city ?? "the pool"}.`;
  }
}
const EDGE_WORDS: Record<string, string> = {
  HAS_PATIENT: "This family's patient.", HAS_DONOR: "This family's donor.", REGISTERED_AT: "Where the family is registered.",
  HAS_ABO: "This person's blood group.", HAS_ANTIGEN: "A tissue marker the donor carries.", HAS_ANTIBODY: "An antibody in the patient's blood.",
  REACTS_WITH: "This antibody attacks that tissue marker.", HAS_LIVER: "The donor's liver measurements.",
};

/** Parts fan out on the left; families come in on the right, one ring per hop. Deterministic, so nothing jumps. */
function layout(g: Explore): Map<string, Pos> {
  const at = new Map<string, Pos>();
  const center = `fam:${g.center}`;
  at.set(center, { x: CX, y: CY });
  const D = { x: CX - 170, y: CY - 105 }, P = { x: CX - 170, y: CY + 105 };
  at.set(`don:${g.center}`, D);
  at.set(`pat:${g.center}`, P);
  const byType = (t: ExploreNodeType) => g.nodes.filter((n) => n.type === t);
  const hosp = byType("hospital")[0];
  if (hosp) at.set(hosp.id, { x: CX - 20, y: CY + 175 });
  const fan = (origin: Pos, ids: string[], from: number, to: number, r: number) => {
    ids.forEach((id, i) => {
      const a = ((from + (ids.length === 1 ? (to - from) / 2 : (i * (to - from)) / (ids.length - 1))) * Math.PI) / 180;
      at.set(id, { x: origin.x + r * Math.cos(a), y: origin.y + r * Math.sin(a) });
    });
  };
  const dEdges = new Set(g.edges.filter((e) => e.from === `don:${g.center}`).map((e) => e.to));
  const pEdges = new Set(g.edges.filter((e) => e.from === `pat:${g.center}`).map((e) => e.to));
  const blood = byType("blood").map((n) => n.id);
  const shared = blood.filter((b) => dEdges.has(b) && pEdges.has(b));
  shared.forEach((b) => at.set(b, { x: CX - 300, y: CY }));
  fan(D, [...blood.filter((b) => dEdges.has(b) && !shared.includes(b)), ...byType("liver").map((n) => n.id), ...byType("antigen").map((n) => n.id)], 150, 265, 125);
  fan(P, [...blood.filter((b) => pEdges.has(b) && !shared.includes(b)), ...byType("antibody").map((n) => n.id)], 95, 210, 125);
  // Families: out (this donor gives) top right, in (gives to this patient) bottom right, both ways in the middle.
  const fams = g.nodes.filter((n) => n.type === "family" && n.id !== center);
  const out = new Set(g.edges.filter((e) => e.type === "CAN_GIVE_TO" && e.from === center).map((e) => e.to));
  const inn = new Set(g.edges.filter((e) => e.type === "CAN_GIVE_TO" && e.to === center).map((e) => e.from));
  const ring = (nodes: ExploreNode[], r: number, from: number, to: number) => {
    nodes.forEach((n, i) => {
      const a = ((from + (nodes.length === 1 ? (to - from) / 2 : (i * (to - from)) / (nodes.length - 1))) * Math.PI) / 180;
      at.set(n.id, { x: CX + r * Math.cos(a), y: CY + r * Math.sin(a) });
    });
  };
  const hop1 = fams.filter((n) => n.hop <= 1);
  const both = hop1.filter((n) => out.has(n.id) && inn.has(n.id));
  const onlyOut = hop1.filter((n) => out.has(n.id) && !inn.has(n.id));
  const onlyIn = hop1.filter((n) => !out.has(n.id));
  ring(onlyOut, 230, -104, -20);
  ring(both, 230, -13, 13);
  ring(onlyIn, 230, 20, 104);
  ring(fams.filter((n) => n.hop >= 2), 370, -70, 70);
  for (const [k, p] of at) at.set(k, { x: Math.max(24, Math.min(W - 24, p.x)), y: Math.max(24, Math.min(H - 30, p.y)) });
  return at;
}

function Glyph({ type, r }: { type: ExploreNodeType; r: number }) {
  const s = r * 0.62;
  const st = { fill: "none", stroke: "#fff", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  switch (type) {
    case "patient": return <g {...st}><circle cx={0} cy={-s * 0.35} r={s * 0.38} /><path d={`M${-s * 0.7} ${s * 0.75} Q0 ${-s * 0.05} ${s * 0.7} ${s * 0.75}`} /></g>;
    case "donor": return <path d={`M0 ${s * 0.75} C${-s} ${0} ${-s * 0.6} ${-s * 0.85} 0 ${-s * 0.3} C${s * 0.6} ${-s * 0.85} ${s} 0 0 ${s * 0.75}Z`} fill="#fff" />;
    case "hospital": return <g {...st}><path d={`M${-s * 0.5} ${-s * 0.7}V${s * 0.7}M${s * 0.5} ${-s * 0.7}V${s * 0.7}M${-s * 0.5} 0H${s * 0.5}`} /></g>;
    case "blood": return <path d={`M0 ${-s * 0.85} C${s * 0.75} 0 ${s * 0.6} ${s * 0.8} 0 ${s * 0.8} C${-s * 0.6} ${s * 0.8} ${-s * 0.75} 0 0 ${-s * 0.85}Z`} fill="#fff" />;
    case "antibody": return <g {...st}><path d={`M0 ${s * 0.8}V0M0 0L${-s * 0.6} ${-s * 0.7}M0 0L${s * 0.6} ${-s * 0.7}`} /></g>;
    case "antigen": return <circle r={s * 0.38} fill="#fff" />;
    case "liver": return <path d={`M${-s * 0.8} ${-s * 0.2} Q${-s * 0.2} ${-s * 0.9} ${s * 0.8} ${-s * 0.35} Q${s * 0.3} ${s * 0.85} ${-s * 0.6} ${s * 0.45}Z`} fill="#fff" />;
    default: return <g {...st}><circle cx={-s * 0.32} cy={-s * 0.25} r={s * 0.3} /><circle cx={s * 0.38} cy={-s * 0.15} r={s * 0.25} /><path d={`M${-s * 0.85} ${s * 0.7} Q${-s * 0.3} ${s * 0.05} ${s * 0.2} ${s * 0.7}M${s * 0.05} ${s * 0.45} Q${s * 0.45} ${s * 0.05} ${s * 0.85} ${s * 0.6}`} /></g>;
  }
}

const nodeColor = (n: ExploreNode, center: string) =>
  n.type === "family" ? (n.id === center ? "#183B32" : n.data.organ === "liver" ? LIVER : TYPE.family.color) : TYPE[n.type].color;

export default function FamilyExplorer({ pair, height = 600, onExplore }: { pair: string; height?: number; onExplore?: (pair: string) => void }) {
  const [hops, setHops] = useState(1);
  const r = useResource<Explore>(`explore:${pair}:${hops}`, (a) => a.explore(pair, hops));
  const [sel, setSel] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [view, setView] = useState({ x: 0, y: 0, k: 1 });
  const drag = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null);
  const [hoverEdge, setHoverEdge] = useState<string | null>(null);
  const [tip, setTip] = useState<{ x: number; y: number } | null>(null);
  const [walk, setWalk] = useState<WalkStep | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  // A step may need families further out: open the hops it talks about.
  useEffect(() => { if (walk?.hops && walk.hops > hops) setHops(walk.hops); }, [walk]); // eslint-disable-line react-hooks/exhaustive-deps
  // Touchpad pinch (ctrl + wheel) and scroll zoom around the pointer. Non-passive, so the page doesn't scroll instead.
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const f = Math.exp(-e.deltaY * (e.ctrlKey ? 0.012 : 0.0025));
      setView((v) => {
        const k = Math.max(0.6, Math.min(3.2, v.k * f));
        const px = -v.x + ((e.clientX - rect.left) / rect.width) * (W / v.k), py = -v.y + ((e.clientY - rect.top) / rect.height) * (H / v.k);
        return { k, x: -(px - ((e.clientX - rect.left) / rect.width) * (W / k)), y: -(py - ((e.clientY - rect.top) / rect.height) * (H / k)) };
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  });
  const g = r.data;
  const center = `fam:${pair}`;
  const pos = useMemo(() => (g ? layout(g) : new Map<string, Pos>()), [g]);
  const nodes = useMemo(() => new Map((g?.nodes ?? []).map((n) => [n.id, n])), [g]);
  const selected = sel ?? center;
  const focus = hover ?? null;
  const litNodes = walk ? new Set(walk.nodes) : null;
  const litEdges = walk ? new Set(walk.edges) : null;
  const touching = (e: ExploreEdge, id: string | null) => !!id && (e.from === id || e.to === id);

  if (r.error && !g) return <p className="panel p-6 text-sm" style={{ color: "var(--bad)" }}>Couldn&rsquo;t load {pair}&rsquo;s graph: {r.error.message}</p>;
  const selNode = nodes.get(selected);
  const selEdge = g?.edges.find((e) => e.id === selected);
  const conn = g?.edges.filter((e) => e.from === selected || e.to === selected) ?? [];
  const famCount = g?.nodes.filter((n) => n.type === "family").length ?? 0;

  return (
    <section className="rounded-2xl border overflow-hidden" style={{ borderColor: "var(--line)", background: "var(--surface)" }} aria-label={`${pair} in the graph`}>
      <header className="flex flex-wrap items-center gap-3 px-4 py-3 border-b" style={{ borderColor: "var(--line)" }}>
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: g?.organ === "liver" ? LIVER : TYPE.family.color }} />
        <span className="font-semibold" style={{ color: "var(--ink-strong)" }}>{pair}</span>
        <span className="text-xs rounded-full px-2 py-0.5" style={{ background: "var(--sage-pale)", color: "var(--forest-mid)" }}>Family · {g?.organ ?? "…"}</span>
        <span className="ml-auto text-xs muted tnum">{g ? `${g.nodes.length} nodes · ${g.edges.length} links` : "loading…"}</span>
        <span className="text-xs muted">Hops</span>
        <div className="inline-flex rounded-lg border p-0.5" style={{ borderColor: "var(--line)" }} role="radiogroup" aria-label="Hops">
          {[1, 2, 3].map((h) => (
            <button key={h} role="radio" aria-checked={hops === h} onClick={() => setHops(h)}
                    className="h-7 w-8 rounded-md text-sm font-semibold" style={{ background: hops === h ? "var(--forest)" : "transparent", color: hops === h ? "#fff" : "var(--ink)" }}>{h}</button>
          ))}
        </div>
      </header>
      <div className="px-4 py-2.5 border-b" style={{ borderColor: "var(--line)" }}>
        <Walkthrough load={(lang) => familyWalk(pair, lang)} onStep={setWalk} label="Explain this graph, step by step" />
      </div>
      {g && (
        <div className="px-4 py-2.5 text-sm flex flex-wrap gap-x-6 gap-y-1 border-b" style={{ borderColor: "var(--line)", background: "var(--surface-soft)" }}>
          <span><span className="font-semibold" style={{ color: MARK.own }}>Why not their own donor: </span>{g.why_not_own.text}.</span>
          <span className="muted">{HOP_TEXT[hops]}</span>
        </div>
      )}
      <div className="grid lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="relative" style={{ height }} ref={box}
             onPointerMove={(e) => { const r = box.current?.getBoundingClientRect(); if (r) setTip({ x: e.clientX - r.left, y: e.clientY - r.top }); }}
             onPointerLeave={() => { setTip(null); setHoverEdge(null); }}>
          {!g ? <div className="grid h-full place-items-center text-sm muted">Reading {pair} from the graph…</div> : (
            <svg ref={svgRef} viewBox={`${-view.x} ${-view.y} ${W / view.k} ${H / view.k}`} className="h-full w-full select-none touch-none"
                 style={{ background: "radial-gradient(circle at 49% 50%, #F4F8F3 0%, #FBFAF6 70%)", cursor: drag.current ? "grabbing" : "grab" }}
                 onPointerDown={(e) => { if ((e.target as Element).closest("[data-node],[data-edge]")) return; drag.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y }; (e.currentTarget as Element).setPointerCapture(e.pointerId); }}
                 onPointerMove={(e) => { const d = drag.current; if (!d) return; const s = (W / view.k) / (e.currentTarget as SVGSVGElement).clientWidth; setView((v) => ({ ...v, x: d.vx + (e.clientX - d.x) * s, y: d.vy + (e.clientY - d.y) * s })); }}
                 onPointerUp={() => { drag.current = null; }} role="img" aria-label={`${pair} and the families around it at ${hops} hop${hops > 1 ? "s" : ""}`}>
              <defs>
                {["base", "own", "loop2", "loop3"].map((m) => (
                  <marker key={m} id={`arrow-${pair}-${m}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                    <path d="M0 0L10 5L0 10Z" fill={m === "base" ? "#9DB0A3" : MARK[m]} />
                  </marker>
                ))}
              </defs>
              {/* hop rings */}
              {[230, 370].slice(0, hops >= 2 ? 2 : 1).map((rr) => <circle key={rr} cx={CX} cy={CY} r={rr} fill="none" stroke="#DCE6DD" strokeDasharray="3 6" />)}
              {g.edges.map((e) => {
                const a = pos.get(e.from), b = pos.get(e.to);
                if (!a || !b) return null;
                const tb = nodes.get(e.to);
                const rb = tb ? (tb.id === center ? 24 : TYPE[tb.type].r) + 3 : 10;
                const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
                const bend = e.type === "CAN_GIVE_TO" ? 0.12 : 0.04;
                const mx = (a.x + b.x) / 2 - dy * bend, my = (a.y + b.y) / 2 + dx * bend;
                const ex = b.x - (dx / len) * rb, ey = b.y - (dy / len) * rb;
                const mark = e.mark;
                const hov = hoverEdge === e.id;
                const said = !!litEdges?.has(e.id);
                const lit = hov || said || touching(e, focus) || touching(e, selected) || sel === e.id;
                const dim = litEdges ? !said : (focus && !touching(e, focus)) || (hoverEdge ? !hov : false);
                const color = said ? "#C98A1E" : hov ? "#183B32" : mark ? MARK[mark] : lit ? "#5E8A73" : "#B9C7BD";
                const width = said ? 4 : hov ? 3.4 : mark ? 2.6 : lit ? 1.8 : 1;
                const d = `M${a.x} ${a.y} Q${mx} ${my} ${ex} ${ey}`;
                return (
                  <g key={e.id} data-edge onClick={() => setSel(e.id)} style={{ cursor: "pointer", opacity: dim ? 0.15 : 1, transition: "opacity .2s" }}
                     onPointerEnter={() => setHoverEdge(e.id)} onPointerLeave={() => setHoverEdge((h) => (h === e.id ? null : h))}>
                    <path d={d} fill="none" stroke="transparent" strokeWidth={16} />
                    {said && <path d={d} fill="none" stroke="#F3D9A4" strokeWidth={10} opacity={0.7} />}
                    <path d={d} fill="none" stroke={color} strokeWidth={width} opacity={mark || lit ? 1 : 0.75}
                          markerEnd={e.type === "CAN_GIVE_TO" || e.type === "REACTS_WITH" ? `url(#arrow-${pair}-${mark ?? "base"})` : undefined} />
                    {mark && <path d={d} fill="none" stroke="#fff" strokeWidth={1.2} className={mark === "own" ? "flow" : "flow-slow"} opacity={0.9} />}
                  </g>
                );
              })}
              {g.nodes.map((n) => {
                const p = pos.get(n.id);
                if (!p) return null;
                const isC = n.id === center;
                const rr = isC ? 24 : TYPE[n.type].r;
                const on = selected === n.id;
                const dim = litNodes ? !litNodes.has(n.id) : focus && focus !== n.id && !g.edges.some((e) => touching(e, focus) && (e.from === n.id || e.to === n.id));
                const said = !!litNodes?.has(n.id);
                const own = g.why_not_own.edges.some((id) => { const e = g.edges.find((x) => x.id === id); return e && (e.from === n.id || e.to === n.id); });
                return (
                  <g key={n.id} data-node transform={`translate(${p.x} ${p.y})`} style={{ cursor: "pointer", opacity: dim ? 0.25 : 1, transition: "opacity .15s" }}
                     onClick={() => setSel(n.id)} onPointerEnter={() => setHover(n.id)} onPointerLeave={() => setHover(null)}
                     tabIndex={0} role="button" aria-label={`${TYPE[n.type].label} ${n.label}`} onKeyDown={(e) => e.key === "Enter" && setSel(n.id)}>
                    {said && <circle r={rr + 11} fill="#F3D9A4" opacity={0.55} className="pulse-soft" />}
                    {(on || isC) && <circle r={rr + 7} fill="none" stroke={on ? "#D99A35" : "#A6D8B5"} strokeWidth={on ? 2.5 : 2} className={isC ? "pulse-soft" : undefined} />}
                    {own && <circle r={rr + 4} fill="none" stroke={MARK.own} strokeWidth={1.8} strokeDasharray="3 3" />}
                    <circle r={rr} fill={nodeColor(n, center)} stroke="#fff" strokeWidth={2} />
                    <Glyph type={n.type} r={rr} />
                    <text y={rr + 13} textAnchor="middle" fontSize={isC ? 12 : n.type === "antigen" || n.type === "antibody" ? 9.5 : 10.5} fontWeight={isC || n.type !== "family" ? 600 : 500}
                          fill="#1F2C27" style={{ paintOrder: "stroke", stroke: "#FBFAF6", strokeWidth: 3 }}>{n.label}</text>
                    {(isC || n.type === "patient" || n.type === "donor") && <text y={rr + 25} textAnchor="middle" fontSize={9} fill="#66736B" style={{ paintOrder: "stroke", stroke: "#FBFAF6", strokeWidth: 3 }}>{n.sub}</text>}
                  </g>
                );
              })}
            </svg>
          )}
          <div className="absolute right-3 top-3 flex flex-col rounded-lg border overflow-hidden" style={{ borderColor: "var(--line)", background: "var(--surface)" }}>
            {[["+", 1.25], ["−", 0.8]].map(([t, f]) => (
              <button key={t as string} className="h-8 w-8 text-lg font-semibold hover:bg-[var(--surface-soft)]" aria-label={t === "+" ? "Zoom in" : "Zoom out"}
                      onClick={() => setView((v) => { const k = Math.max(0.6, Math.min(2.6, v.k * (f as number))); const cx = -v.x + W / v.k / 2, cy = -v.y + H / v.k / 2; return { k, x: -(cx - W / k / 2), y: -(cy - H / k / 2) }; })}>{t}</button>
            ))}
            <button className="h-8 w-8 grid place-items-center border-t hover:bg-[var(--surface-soft)]" style={{ borderColor: "var(--line)" }} aria-label="Reset view" onClick={() => setView({ x: 0, y: 0, k: 1 })}><Icon name="reset" size={14} /></button>
          </div>
          {tip && g && (hoverEdge || hover) && (() => {
            const e = hoverEdge ? g.edges.find((x) => x.id === hoverEdge) : null;
            const n = !e && hover ? nodes.get(hover) : null;
            if (!e && !n) return null;
            const title = e ? (e.type === "CAN_GIVE_TO" ? `${nodes.get(e.from)?.label}'s donor → ${nodes.get(e.to)?.label}'s patient` : `${nodes.get(e.from)?.label} → ${nodes.get(e.to)?.label}`)
              : `${TYPE[n!.type].label}: ${n!.label}`;
            const body = e ? (e.type === "CAN_GIVE_TO" ? `${e.p != null ? `${Math.round(e.p * 100)}% chance it works. ` : ""}${e.why ?? ""}` : EDGE_WORDS[e.type] ?? e.label)
              : explainNode(n!);
            const w = box.current?.clientWidth ?? 600;
            return (
              <div className="pointer-events-none absolute z-20 max-w-[18rem] rounded-lg border px-3 py-2 text-xs shadow-md"
                   style={{ left: Math.min(tip.x + 14, w - 300), top: Math.max(8, tip.y - 12), background: "var(--surface)", borderColor: "var(--line)" }}>
                <p className="font-semibold" style={{ color: "var(--ink-strong)" }}>{title}</p>
                <p className="mt-0.5" style={{ color: "var(--ink)" }}>{body}</p>
                {e?.mark === "own" && <p className="mt-1" style={{ color: MARK.own }}>Part of why the family&rsquo;s own donor can&rsquo;t give.</p>}
              </div>
            );
          })()}
          <div className="absolute left-3 bottom-3 flex flex-wrap gap-x-3 gap-y-1 rounded-lg px-3 py-2 text-[0.7rem]" style={{ background: "rgba(255,255,255,0.88)", border: "1px solid var(--line)" }}>
            {(Object.keys(TYPE) as ExploreNodeType[]).filter((t) => g?.nodes.some((n) => n.type === t)).map((t) => (
              <span key={t} className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: TYPE[t].color }} />{TYPE[t].label}</span>
            ))}
            <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-4" style={{ background: MARK.own }} />why not their own donor</span>
            {hops >= 2 && <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-4" style={{ background: MARK.loop2 }} />2-way swap</span>}
            {hops >= 3 && <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-4" style={{ background: MARK.loop3 }} />3-way swap</span>}
          </div>
        </div>

        <aside className="border-t lg:border-t-0 lg:border-l p-4 overflow-y-auto text-sm" style={{ borderColor: "var(--line)", maxHeight: height }}>
          {selEdge ? (
            <>
              <p className="text-xs font-bold uppercase tracking-[0.12em]" style={{ color: selEdge.mark ? MARK[selEdge.mark] : "var(--forest-mid)" }}>{selEdge.type === "CAN_GIVE_TO" ? "A possible donation" : "Connection"}</p>
              <p className="mt-1 text-[1.05rem] font-semibold" style={{ color: "var(--ink-strong)" }}>
                {selEdge.type === "CAN_GIVE_TO" ? `${nodes.get(selEdge.from)?.label}'s donor → ${nodes.get(selEdge.to)?.label}'s patient` : `${nodes.get(selEdge.from)?.label} → ${nodes.get(selEdge.to)?.label}`}
              </p>
              <p className="muted">{selEdge.label}</p>
              {selEdge.p != null && <p className="mt-2">Chance this donation goes ahead: <strong>{Math.round(selEdge.p * 100)}%</strong></p>}
              {selEdge.reasons && selEdge.reasons.length > 0 && (
                <>
                  <p className="mt-3 text-xs font-bold uppercase tracking-[0.12em] muted">Why it can work</p>
                  <ul className="mt-1 space-y-1">{(selEdge.why ?? "").split("; ").filter(Boolean).map((x) => <li key={x} className="flex gap-2"><span style={{ color: "var(--forest-mid)" }}>•</span>{x[0].toUpperCase() + x.slice(1)}</li>)}</ul>
                  <p className="mt-2 text-xs muted">Stored on the link itself when it was built, so every explanation is read from the graph.</p>
                </>
              )}
              {selEdge.mark === "own" && <p className="mt-3 rounded-lg p-2.5" style={{ background: "var(--bad-soft)", color: "var(--bad)" }}>Part of the reason this family&rsquo;s own donor can&rsquo;t give: {g?.why_not_own.text}.</p>}
              <button className="mt-3 text-xs underline" style={{ color: "var(--forest)" }} onClick={() => setSel(null)}>Back to {pair}</button>
            </>
          ) : selNode && (
            <>
              <p className="text-xs font-bold uppercase tracking-[0.12em] flex items-center gap-1.5" style={{ color: nodeColor(selNode, center) }}>
                <span className="h-2 w-2 rounded-full" style={{ background: nodeColor(selNode, center) }} />{TYPE[selNode.type].label}{selNode.hop > 0 ? ` · ${selNode.hop} hop${selNode.hop > 1 ? "s" : ""} away` : ""}
              </p>
              <p className="mt-1 text-[1.15rem] font-semibold" style={{ color: "var(--ink-strong)" }}>{selNode.label}</p>
              {selNode.sub && <p className="muted">{selNode.sub}</p>}
              {selNode.id !== center && <p className="mt-2 rounded-lg p-2.5" style={{ background: "var(--sage-pale)", color: "var(--ink-strong)" }}>{explainNode(selNode)}</p>}
              <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
                {Object.entries(selNode.data).filter(([k, v]) => PRETTY[k] && v != null && v !== "").map(([k, v]) => (
                  <div key={k} className="contents"><dt className="muted">{PRETTY[k]}</dt><dd style={{ color: "var(--ink-strong)" }}>{Array.isArray(v) ? v.join(", ") || "none" : String(v)}</dd></div>
                ))}
              </dl>
              {selNode.type === "family" && selNode.id !== center && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {onExplore ? <button className="btn btn-sm btn-primary" onClick={() => { onExplore(selNode.label); setSel(null); }}>Explore from here</button>
                    : <Link className="btn btn-sm btn-primary" href={`/families/${selNode.label}`}>Explore from here</Link>}
                  {selNode.data.loop_id && <Link className="btn btn-sm" href={`/swaps/${selNode.data.loop_id}`}>Open swap {selNode.data.loop_id}</Link>}
                </div>
              )}
              {selNode.id === center && g && (
                <p className="mt-3 text-xs muted">Donor can give to {g.counts.gives_to} families; {g.counts.receives_from} families&rsquo; donors can give to this patient.
                  Swaps through this family: {g.counts.two_way} two-way, {g.counts.three_way} three-way.</p>
              )}
              <p className="mt-4 text-xs font-bold uppercase tracking-[0.12em] muted">Connections ({conn.length})</p>
              <ul className="mt-1.5 space-y-0.5">
                {conn.slice(0, 40).map((e) => {
                  const other = nodes.get(e.from === selected ? e.to : e.from);
                  if (!other) return null;
                  return (
                    <li key={e.id}>
                      <button className="w-full flex items-center gap-2 rounded-md px-1.5 py-1 text-left hover:bg-[var(--surface-soft)]" onClick={() => setSel(e.type === "CAN_GIVE_TO" ? e.id : other.id)}>
                        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: nodeColor(other, center) }} />
                        <span className="min-w-0 flex-1 truncate" style={{ color: "var(--ink-strong)" }}>{other.label}</span>
                        <span className="text-xs shrink-0" style={{ color: e.mark ? MARK[e.mark] : "var(--muted)" }}>{e.from === selected ? e.label : `← ${e.label}`}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </aside>
      </div>
      {g && g.loops.length > 0 && (
        <footer className="border-t px-4 py-3" style={{ borderColor: "var(--line)" }}>
          <p className="text-xs font-bold uppercase tracking-[0.12em] muted">Swaps that close back to {pair} · strongest shown</p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {g.loops.map((l, i) => (
              <li key={i} className="rounded-full border px-3 py-1 text-xs" style={{ borderColor: l.size === 2 ? MARK.loop2 : MARK.loop3 }}>
                <span className="font-semibold" style={{ color: l.size === 2 ? MARK.loop2 : MARK.loop3 }}>{l.size}-way</span> {[...l.pairs, l.pairs[0]].join(" → ")} · {Math.round(l.p_all * 100)}% every link holds
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs muted">{famCount - 1} families shown of {g.counts.gives_to + g.counts.receives_from} links; the strongest by chance. Read with Q55–Q57 in {g.queries.reduce((s, q) => s + q.ms, 0).toFixed(0)} ms.</p>
        </footer>
      )}
    </section>
  );
}

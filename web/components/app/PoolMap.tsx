"use client";
// The live pool on a real map of India. Each line is one planned donation (donor of one family to the
// patient of another); lines that close a ring are one swap loop. Scroll or pinch to zoom, drag to move,
// and click any single line to inspect it. Line widths and labels keep their on-screen size while
// zooming, so overlapping lines pull apart as you zoom in.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { INDIA, MAP_H, MAP_W, NEIGHBOURS, STATE_LINES, project } from "@/lib/india-map";
import type { Hospital, LoopSummary, PoolLink } from "@/lib/data/types";
import { Icon } from "./icons";
import { ORGAN_NAMES, ORGANS, organOf } from "@/lib/organs";

type Pt = [number, number];
type View = { k: number; x: number; y: number };
export const linkKey = (l: { loop_id: string; from_pair: string; to_pair: string }) => `${l.loop_id}:${l.from_pair}>${l.to_pair}`;

const MIN_K = 1, MAX_K = 14;
const HOME: View = { k: 1, x: 0, y: 0 };
const C = {
  sea: "#0B1E19", land: "#1A3D33", landEdge: "#4F8A73", states: "rgba(166,216,181,0.16)", neighbour: "#132C26",
  failed: "#E08A80",  // donation lines take their organ's colour (lib/organs.ts)
  selected: "#FFFFFF", city: "#0F2621", cityRing: "#A6D8B5",
};

type Drawn = {
  link: PoolLink; key: string; d: string; hit: string; arrow: Pt; angle: number; from: string; to: string; self: boolean;
};

function quad(a: Pt, b: Pt, bend: number): { d: string; mid: Pt; angle: number } {
  const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
  const dx = b[0] - a[0], dy = b[1] - a[1], n = Math.hypot(dx, dy) || 1;
  const cx = mx - (dy / n) * bend, cy = my + (dx / n) * bend;
  const t = 0.58, u = 1 - t;
  const px = u * u * a[0] + 2 * u * t * cx + t * t * b[0], py = u * u * a[1] + 2 * u * t * cy + t * t * b[1];
  const tx = 2 * u * (cx - a[0]) + 2 * t * (b[0] - cx), ty = 2 * u * (cy - a[1]) + 2 * t * (b[1] - cy);
  return { d: `M${a[0].toFixed(1)},${a[1].toFixed(1)} Q${cx.toFixed(1)},${cy.toFixed(1)} ${b[0].toFixed(1)},${b[1].toFixed(1)}`, mid: [px, py], angle: Math.atan2(ty, tx) };
}

/** A small teardrop for a donation between two families at the same hospital. */
function selfLoop(a: Pt, i: number): { d: string; mid: Pt; angle: number } {
  const ang = -Math.PI / 2 + (i * Math.PI) / 3.2, r = 16 + 5 * i;
  const ux = Math.cos(ang), uy = Math.sin(ang), vx = -uy, vy = ux;
  const c1: Pt = [a[0] + ux * r * 1.6 + vx * r, a[1] + uy * r * 1.6 + vy * r];
  const c2: Pt = [a[0] + ux * r * 1.6 - vx * r, a[1] + uy * r * 1.6 - vy * r];
  const mid: Pt = [a[0] + ux * r * 1.2, a[1] + uy * r * 1.2];
  return { d: `M${a[0]},${a[1]} C${c1[0]},${c1[1]} ${c2[0]},${c2[1]} ${a[0]},${a[1]}`, mid, angle: ang - Math.PI / 2 };
}

export default function PoolMap({ hospitals, loops, links, focusLoop, selectedLink, selectedCity, onSelectLink, onSelectCity, onBackground, className }: {
  hospitals: Hospital[]; loops: LoopSummary[]; links: PoolLink[]; focusLoop: string | null; selectedLink: string | null; selectedCity: string | null;
  onSelectLink: (key: string) => void; onSelectCity: (code: string) => void; onBackground?: () => void; className?: string;
}) {
  const svg = useRef<SVGSVGElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View>(HOME);
  // Map units per screen pixel, so labels, dots and arrows keep a readable on-screen size.
  const [unit, setUnit] = useState(2);
  useEffect(() => {
    const el = svg.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      const { width, height } = e.contentRect;
      if (width && height) setUnit(Math.max(MAP_W / width, MAP_H / height));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const [animate, setAnimate] = useState(false);
  const [hover, setHover] = useState<{ key: string; x: number; y: number } | null>(null);
  const drag = useRef<{ id: number; sx: number; sy: number; vx: number; vy: number; moved: boolean } | null>(null);
  const pinch = useRef<Map<number, Pt>>(new Map());
  const pinchStart = useRef<{ dist: number; view: View; c: Pt } | null>(null);

  const city = useMemo(() => new Map(hospitals.map((h) => [h.code, { ...h, xy: project(h.lon, h.lat) as Pt }])), [hospitals]);
  const pairCity = useMemo(() => {
    const m = new Map<string, string>();
    loops.forEach((l) => l.pairs.forEach((p) => m.set(p.pair_id, p.code)));
    return m;
  }, [loops]);
  const loopStatus = useMemo(() => new Map(loops.map((l) => [l.loop_id, l.status])), [loops]);

  const drawn: Drawn[] = useMemo(() => {
    const seen = new Map<string, number>(), total = new Map<string, number>();
    const pairKey = (a: string, b: string) => [a, b].sort().join("|");
    links.forEach((l) => {
      const f = pairCity.get(l.from_pair), t = pairCity.get(l.to_pair);
      if (f && t) total.set(pairKey(f, t), (total.get(pairKey(f, t)) ?? 0) + 1);
    });
    const out: Drawn[] = [];
    for (const l of links) {
      const from = pairCity.get(l.from_pair), to = pairCity.get(l.to_pair);
      const a = from && city.get(from)?.xy, b = to && city.get(to)?.xy;
      if (!from || !to || !a || !b) continue;
      const k = pairKey(from, to);
      const i = seen.get(k) ?? 0;
      seen.set(k, i + 1);
      let g;
      if (from === to) g = selfLoop(a, i);
      else {
        const n = total.get(k) ?? 1;
        // Spread parallel links between the same two cities; flip so A→B and B→A sit on opposite sides.
        const dir = from < to ? 1 : -1;
        g = quad(a, b, dir * (18 + 11 * (i - (n - 1) / 2)));
      }
      out.push({ link: l, key: linkKey(l), d: g.d, hit: g.d, arrow: g.mid, angle: g.angle, from, to, self: from === to });
    }
    return out;
  }, [links, pairCity, city]);

  // ---- pan and zoom ------------------------------------------------------------
  const toMap = useCallback((clientX: number, clientY: number): Pt => {
    const s = svg.current;
    if (!s) return [0, 0];
    const p = s.createSVGPoint();
    p.x = clientX; p.y = clientY;
    const m = s.getScreenCTM();
    if (!m) return [0, 0];
    const q = p.matrixTransform(m.inverse());
    return [q.x, q.y];
  }, []);
  const clamp = (v: View): View => {
    const k = Math.min(MAX_K, Math.max(MIN_K, v.k));
    const pad = 120;
    return { k, x: Math.min(pad, Math.max(MAP_W * (1 - k) - pad, v.x)), y: Math.min(pad, Math.max(MAP_H * (1 - k) - pad, v.y)) };
  };
  const zoomAt = useCallback((c: Pt, factor: number, smooth = false) => {
    setAnimate(smooth);
    setView((v) => {
      const k = Math.min(MAX_K, Math.max(MIN_K, v.k * factor));
      const r = k / v.k;
      return clamp({ k, x: c[0] - (c[0] - v.x) * r, y: c[1] - (c[1] - v.y) * r });
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const s = svg.current;
    if (!s) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      zoomAt(toMap(e.clientX, e.clientY), Math.exp(-e.deltaY * 0.0022));
    };
    s.addEventListener("wheel", onWheel, { passive: false });
    return () => s.removeEventListener("wheel", onWheel);
  }, [zoomAt, toMap]);

  const onPointerDown = (e: React.PointerEvent) => {
    pinch.current.set(e.pointerId, [e.clientX, e.clientY]);
    if (pinch.current.size === 2) {
      const [p1, p2] = [...pinch.current.values()];
      pinchStart.current = { dist: Math.hypot(p1[0] - p2[0], p1[1] - p2[1]), view, c: toMap((p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2) };
      drag.current = null;
      return;
    }
    drag.current = { id: e.pointerId, sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y, moved: false };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (pinch.current.has(e.pointerId)) pinch.current.set(e.pointerId, [e.clientX, e.clientY]);
    if (pinch.current.size === 2 && pinchStart.current) {
      const [p1, p2] = [...pinch.current.values()];
      const st = pinchStart.current;
      const k = Math.min(MAX_K, Math.max(MIN_K, st.view.k * (Math.hypot(p1[0] - p2[0], p1[1] - p2[1]) / st.dist)));
      const r = k / st.view.k;
      setAnimate(false);
      setView(clamp({ k, x: st.c[0] - (st.c[0] - st.view.x) * r, y: st.c[1] - (st.c[1] - st.view.y) * r }));
      return;
    }
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const a = toMap(d.sx, d.sy), b = toMap(e.clientX, e.clientY);
    if (!d.moved && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) > 4) {
      d.moved = true;
      (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    }
    if (d.moved) {
      setAnimate(false);
      setView((v) => clamp({ ...v, x: d.vx + (b[0] - a[0]), y: d.vy + (b[1] - a[1]) }));
    }
  };
  const justDragged = useRef(false);
  const endPointer = (e: React.PointerEvent) => {
    pinch.current.delete(e.pointerId);
    if (pinch.current.size < 2) pinchStart.current = null;
    const d = drag.current;
    drag.current = null;
    if (d?.moved) { justDragged.current = true; setTimeout(() => { justDragged.current = false; }, 0); }
    // A plain click on empty map (no drag) clears the selection.
    if (d && !d.moved && (e.target as Element).getAttribute("data-bg") === "1") onBackground?.();
  };
  const wasDrag = () => justDragged.current;

  const fitTo = useCallback((codes: string[]) => {
    const pts = codes.map((c) => city.get(c)?.xy).filter(Boolean) as Pt[];
    if (!pts.length) return;
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    const pad = 150;
    const w = Math.max(...xs) - Math.min(...xs) + pad * 2, h = Math.max(...ys) - Math.min(...ys) + pad * 2;
    const k = Math.min(MAX_K, Math.max(MIN_K, Math.min(MAP_W / w, MAP_H / h)));
    const cx = (Math.max(...xs) + Math.min(...xs)) / 2, cy = (Math.max(...ys) + Math.min(...ys)) / 2;
    setAnimate(true);
    setView(clamp({ k, x: MAP_W / 2 - cx * k, y: MAP_H / 2 - cy * k }));
  }, [city]); // eslint-disable-line react-hooks/exhaustive-deps

  const focus = loops.find((l) => l.loop_id === focusLoop);
  const k = view.k;
  const maxPairs = Math.max(1, ...hospitals.map((h) => h.pairs));
  const hovered = hover && drawn.find((d) => d.key === hover.key);
  const touches = (d: Drawn) => !!selectedCity && (d.from === selectedCity || d.to === selectedCity);
  // Draw quiet links first, the focus loop next, the selected link last (on top).
  const order = (d: Drawn) => (d.key === selectedLink ? 3 : d.link.loop_id === focusLoop ? 2 : touches(d) ? 1 : 0);
  const sorted = [...drawn].sort((a, b) => order(a) - order(b));

  return (
    <div ref={wrap} className={`relative select-none ${className ?? ""}`}>
      <svg ref={svg} viewBox={`0 0 ${MAP_W} ${MAP_H}`} className="block w-full h-full touch-none"
           style={{ cursor: drag.current?.moved ? "grabbing" : "grab", background: C.sea }}
           role="application" aria-label={`Map of the shared pool: ${hospitals.length} hospitals, ${links.length} planned donations. Scroll to zoom, drag to move, click a line to inspect it.`}
           onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={endPointer} onPointerCancel={endPointer}
           onPointerLeave={() => setHover(null)}>
        <defs>
          <radialGradient id="pm-land" cx="48%" cy="58%" r="70%">
            <stop offset="0" stopColor="#1F4A3D" />
            <stop offset="1" stopColor="#163A30" />
          </radialGradient>
          <filter id="pm-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2.5" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
        <rect data-bg="1" x={-MAP_W} y={-MAP_H} width={MAP_W * 3} height={MAP_H * 3} fill={C.sea} />
        <g style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${k})`, transformOrigin: "0 0", transition: animate ? "transform 600ms cubic-bezier(.2,.7,.2,1)" : undefined }}>
          <path data-bg="1" d={NEIGHBOURS} fill={C.neighbour} stroke="rgba(166,216,181,0.10)" strokeWidth={0.8} vectorEffect="non-scaling-stroke" />
          <path data-bg="1" d={INDIA} fill="url(#pm-land)" stroke={C.landEdge} strokeWidth={1.3} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          <path d={STATE_LINES} fill="none" stroke={C.states} strokeWidth={0.8} vectorEffect="non-scaling-stroke" pointerEvents="none" />

          {sorted.map((d) => {
            const l = d.link;
            const failed = l.status === "failed" || !!l.failed_cause;
            const brokenLoop = loopStatus.get(l.loop_id) === "broken";
            const inFocus = l.loop_id === focusLoop;
            const sel = d.key === selectedLink;
            const hot = hover?.key === d.key;
            const dim = (!!focusLoop && !inFocus && !touches(d)) || (!!selectedCity && !touches(d) && !inFocus);
            const org = organOf(l);
            const color = failed ? C.failed : sel ? C.selected : inFocus ? org.lineFocus : org.line;
            const width = sel ? 3.6 : inFocus ? 2.8 : hot ? 2.6 : 1.5;
            const opacity = sel || inFocus || hot ? 1 : dim ? 0.18 : brokenLoop ? 0.5 : 0.62;
            const label = `${city.get(d.from)?.city} donor to ${city.get(d.to)?.city} patient, ${l.from_pair} to ${l.to_pair}, ${l.loop_id}${failed ? ", failed" : l.p_success != null ? `, ${Math.round(l.p_success * 100)}% likely to hold` : ""}`;
            return (
              <g key={d.key} role="button" tabIndex={0} aria-label={label} aria-pressed={sel}
                 onClick={() => { if (!wasDrag()) onSelectLink(d.key); }}
                 onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelectLink(d.key); } }}
                 onPointerEnter={(e) => setHover({ key: d.key, x: e.clientX, y: e.clientY })}
                 onPointerMove={(e) => setHover({ key: d.key, x: e.clientX, y: e.clientY })}
                 onPointerLeave={() => setHover((h) => (h?.key === d.key ? null : h))}
                 style={{ cursor: "pointer", outline: "none" }} className="pm-link">
                <path d={d.hit} fill="none" stroke="transparent" strokeWidth={16} vectorEffect="non-scaling-stroke" />
                {(sel || hot) && <path d={d.d} fill="none" stroke={color} strokeWidth={width + 7} opacity={0.22} strokeLinecap="round" vectorEffect="non-scaling-stroke" />}
                <path d={d.d} fill="none" stroke={color} strokeWidth={width} opacity={opacity} strokeLinecap="round"
                      strokeDasharray={failed ? "6 5" : undefined} vectorEffect="non-scaling-stroke"
                      className={failed ? "pulse-bad" : undefined} filter={inFocus || sel ? "url(#pm-glow)" : undefined} />
                <g transform={`translate(${d.arrow[0]} ${d.arrow[1]}) rotate(${(d.angle * 180) / Math.PI}) scale(${unit / k})`} opacity={opacity}>
                  <path d={sel || inFocus ? "M-5,-4 L5,0 L-5,4 Z" : "M-3.5,-2.8 L3.5,0 L-3.5,2.8 Z"} fill={color} />
                </g>
              </g>
            );
          })}

          {hospitals.map((h) => {
            const c = city.get(h.code)!;
            const sel = selectedCity === h.code;
            const inFocus = focus?.pairs.some((p) => p.code === h.code);
            const r = 4 + 4 * Math.sqrt(h.pairs / maxPairs);
            const hot = sel || inFocus;
            return (
              <g key={h.code} transform={`translate(${c.xy[0]} ${c.xy[1]}) scale(${unit / k})`} role="button" tabIndex={0}
                 aria-label={`${h.city}: ${h.pairs} pairs. ${sel ? "Selected. " : ""}Click to show only this hospital's links.`}
                 onClick={() => { if (!wasDrag()) onSelectCity(h.code); }}
                 onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelectCity(h.code); } }}
                 style={{ cursor: "pointer" }}>
                {hot && <circle r={r + 6} fill="rgba(166,216,181,0.18)" />}
                <circle r={r} fill={hot ? C.cityRing : C.city} stroke={hot ? "#FFFFFF" : C.cityRing} strokeWidth={2} />
                <text x={r + 5} y={4} fontSize={hot ? 13.5 : 12} fontWeight={hot ? 700 : 600} fill={hot ? "#FFFFFF" : "#CFE3D6"}
                      style={{ fontFamily: "var(--font-sans)", paintOrder: "stroke", stroke: "#0B1E19", strokeWidth: 3.5, pointerEvents: "none" }}>
                  {h.city}
                </text>
                {k > 2.2 && (
                  <text x={r + 5} y={18} fontSize={10.5} fill="#8FAF9D" style={{ fontFamily: "var(--font-sans)", paintOrder: "stroke", stroke: "#0B1E19", strokeWidth: 4, pointerEvents: "none" }}>
                    {h.pairs} pairs
                  </text>
                )}
              </g>
            );
          })}
        </g>
      </svg>

      {/* zoom controls */}
      <div className="absolute left-3 top-3 flex flex-col overflow-hidden rounded-lg border" style={{ borderColor: "rgba(166,216,181,0.25)", background: "rgba(11,30,25,0.85)" }}>
        {[
          { label: "Zoom in", icon: "+", fn: () => zoomAt([MAP_W / 2, MAP_H / 2], 1.6, true) },
          { label: "Zoom out", icon: "−", fn: () => zoomAt([MAP_W / 2, MAP_H / 2], 1 / 1.6, true) },
        ].map((b) => (
          <button key={b.label} type="button" aria-label={b.label} title={b.label} onClick={b.fn}
                  className="h-9 w-9 grid place-items-center text-lg font-semibold hover:bg-white/10" style={{ color: "#E6F0EA" }}>{b.icon}</button>
        ))}
        <button type="button" aria-label="Show all of India" title="Show all of India" onClick={() => { setAnimate(true); setView(HOME); }}
                className="h-9 w-9 grid place-items-center hover:bg-white/10 border-t" style={{ color: "#E6F0EA", borderColor: "rgba(166,216,181,0.2)" }}>
          <Icon name="reset" size={16} />
        </button>
      </div>
      {focus && (
        <button type="button" onClick={() => fitTo(focus.pairs.map((p) => p.code))}
                className="absolute left-14 top-3 rounded-lg border px-3 h-9 text-xs font-semibold hover:bg-white/10"
                style={{ borderColor: "rgba(166,216,181,0.25)", background: "rgba(11,30,25,0.85)", color: "#E6F0EA" }}>
          Zoom to {focus.loop_id}
        </button>
      )}

      {/* legend and hint */}
      <div className="absolute left-3 bottom-3 rounded-lg px-3 py-2 text-[0.72rem] space-y-1 pointer-events-none" style={{ background: "rgba(11,30,25,0.85)", color: "#B9CBBF" }}>
        {ORGAN_NAMES.filter((o) => links.some((l) => (l.organ ?? "kidney") === o)).map((o) => (
          <p key={o} className="flex items-center gap-2"><svg width="22" height="6"><path d="M1 3H21" stroke={ORGANS[o].line} strokeWidth="1.8" /></svg>{ORGANS[o].label} donation <span style={{ color: "#8FAF9D" }}>(brighter in focus)</span></p>
        ))}
        <p className="flex items-center gap-2"><svg width="22" height="6"><path d="M1 3H21" stroke={C.failed} strokeWidth="2" strokeDasharray="5 4" /></svg>Failed test or work-up</p>
        <p className="pt-1" style={{ color: "#8FAF9D" }}>Scroll to zoom · drag to move · click a line</p>
      </div>

      {hovered && hover && wrap.current && (() => {
        const box = wrap.current.getBoundingClientRect();
        const l = hovered.link;
        return (
          <div className="absolute z-20 pointer-events-none rounded-lg px-3 py-2 text-xs shadow-lg max-w-[15rem]"
               style={{ left: Math.min(hover.x - box.left + 14, box.width - 230), top: Math.max(8, hover.y - box.top - 64), background: "#F7F6F0", color: "#1F2C27" }}>
            <p className="font-semibold">{city.get(hovered.from)?.city} donor → {city.get(hovered.to)?.city} patient</p>
            <p className="muted">{l.from_pair} → {l.to_pair} · {l.loop_id}</p>
            <p className="mt-0.5">{l.failed_cause ? <span style={{ color: "var(--bad)" }}>Failed: {l.failed_detail ?? l.failed_cause}</span>
              : l.p_success != null ? `${Math.round(l.p_success * 100)}% likely to hold` : ""} · click for details</p>
          </div>
        );
      })()}
    </div>
  );
}

"use client";
import { useRef } from "react";
import { gsap, MQ, useGSAP } from "./gsap";
import { Edge, Home, Sparkle } from "./paint";

type Node = { code: string; city: string; pair: string; x: number; y: number; roof: string };
const N: Record<string, Node> = {
  HYD: { code: "HYD", city: "Hyderabad", pair: "P-0154", x: 260, y: 92, roof: "#C96E64" },
  BLR: { code: "BLR", city: "Bengaluru", pair: "P-0211", x: 96, y: 252, roof: "#4E8A72" },
  KOL: { code: "KOL", city: "Kolkata", pair: "P-0388", x: 424, y: 252, roof: "#D4927F" },
  CHE: { code: "CHE", city: "Chennai", pair: "P-0377", x: 260, y: 330, roof: "#4E8A72" },
};
const link = (a: Node, b: Node, bend: number) => {
  const ay = a.y - 40, by = b.y - 40;
  const mx = (a.x + b.x) / 2, my = (ay + by) / 2;
  const dx = b.x - a.x, dy = by - ay, n = Math.hypot(dx, dy) || 1;
  const cx = mx - (dy / n) * bend, cy = my + (dx / n) * bend;
  return { d: `M${a.x},${ay} Q${cx},${cy} ${b.x},${by}`, mid: [0.25 * a.x + 0.5 * cx + 0.25 * b.x, 0.25 * ay + 0.5 * cy + 0.25 * by] };
};
const HB = link(N.HYD, N.BLR, 26);
const BK = link(N.BLR, N.KOL, -60);
const KH = link(N.KOL, N.HYD, 26);
const BC = link(N.BLR, N.CHE, 20);
const CH = link(N.CHE, N.HYD, -30);
const FALLBACK = link(N.BLR, N.HYD, 22);

const STEPS = [
  { h: "A lab test fails.", p: "Bengaluru's crossmatch comes back positive: a DQ7 antibody nobody typed in advance. The loop can't go ahead. Today a coordinator would start phoning other hospitals." },
  { h: "KindRed looks close by first.", p: "It searches two steps out from the families who were let go, not across the whole country. A two-family swap between Hyderabad and Bengaluru is already held in reserve." },
  { h: "A new family, in milliseconds.", p: "Chennai's family takes Kolkata's place. One of 31 groups in the pool is re-planned, and the 8 loops already booked for surgery stay exactly as they were." },
  { h: "A person says yes. KindRed remembers.", p: "Nothing changes until a coordinator approves. The failed pairing is stored and never suggested again, and Kolkata goes back into the pool with higher priority." },
];
const LOG: { step: number; tag: string; tone: string; text: string }[] = [
  { step: 0, tag: "Lab", tone: "#4E8A72", text: "Hyderabad → Bengaluru: crossmatch negative" },
  { step: 0, tag: "Failed", tone: "#B4564C", text: "Bengaluru → Kolkata: positive, DQ7 antibody" },
  { step: 1, tag: "Search", tone: "#8A5A12", text: "Looking two steps around the released families" },
  { step: 1, tag: "Reserve", tone: "#78857D", text: "Hyderabad ⇄ Bengaluru two-way swap held" },
  { step: 2, tag: "Repair", tone: "#2C5A4B", text: "Chennai P-0377 replaces Kolkata · 2.3 of 3 expected" },
  { step: 2, tag: "Scope", tone: "#78857D", text: "1 of 31 groups re-planned · 8 booked loops untouched" },
  { step: 3, tag: "Approved", tone: "#4E8A72", text: "Coordinator approved the repair" },
  { step: 3, tag: "Noted", tone: "#78857D", text: "Bengaluru → Kolkata will not be suggested again" },
];

export default function RepairSection() {
  const root = useRef<HTMLElement>(null);

  useGSAP(() => {
    const q = gsap.utils.selector(root);
    const mm = gsap.matchMedia();
    const logAt = (tl: gsap.core.Timeline, step: number, at: number) =>
      tl.fromTo(q(`.rp-log-${step}`), { autoAlpha: 0, x: -12 }, { autoAlpha: 1, x: 0, duration: 0.3, stagger: 0.18 }, at);
    const status = (tl: gsap.core.Timeline, from: string, to: string, at: number) =>
      tl.to(q(from), { autoAlpha: 0, duration: 0.2 }, at).fromTo(q(to), { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.2 }, at + 0.1);

    const build = (tl: gsap.core.Timeline) => {
      tl.to(q(".rp-bk"), { stroke: "#B4564C", strokeDasharray: "8 9", duration: 0.4 }, 0.5)
        .fromTo(q(".rp-fail"), { autoAlpha: 0, scale: 0.4, transformOrigin: "50% 50%" }, { autoAlpha: 1, scale: 1, duration: 0.4, ease: "back.out(3)" }, 0.6)
        .to(q(".rp-kh"), { opacity: 0.2, duration: 0.4 }, 0.8)
        .to(q(".k-window-rKOL"), { fill: "#9AA79F", duration: 0.3 }, 0.8);
      status(tl, ".rp-s-testing", ".rp-s-broken", 0.6);
      logAt(tl, 0, 0.3);
      tl.fromTo(q(".rp-ring"), { autoAlpha: 0.9, scale: 0.15, transformOrigin: "50% 50%" }, { autoAlpha: 0, scale: 1, duration: 1.2, stagger: 0.3 }, 1.4)
        .fromTo(q(".rp-node-CHE"), { opacity: 0.35 }, { opacity: 1, duration: 0.4 }, 1.9)
        .fromTo(q(".rp-fallback"), { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.4 }, 1.8);
      status(tl, ".rp-s-broken", ".rp-s-search", 1.5);
      logAt(tl, 1, 1.5);
      tl.fromTo(q(".rp-new"), { drawSVG: "0%" }, { drawSVG: "100%", duration: 0.6, stagger: 0.35, ease: "power2.inOut" }, 2.9)
        .to(q(".rp-bk, .rp-fail, .rp-kh"), { opacity: 0.08, duration: 0.5 }, 3.0)
        .to(q(".rp-node-KOL"), { opacity: 0.35, duration: 0.5 }, 3.0)
        .fromTo(q(".rp-approve"), { autoAlpha: 0, y: 10 }, { autoAlpha: 1, y: 0, duration: 0.4 }, 3.4);
      status(tl, ".rp-s-search", ".rp-s-ready", 3.0);
      logAt(tl, 2, 2.9);
      tl.fromTo(q(".rp-cursor"), { autoAlpha: 0, x: 90, y: 60 }, { autoAlpha: 1, x: 0, y: 0, duration: 0.7, ease: "power2.inOut" }, 4.4)
        .to(q(".rp-approve-btn"), { scale: 0.94, duration: 0.1, yoyo: true, repeat: 1 }, 5.1)
        .to(q(".rp-approve-label"), { autoAlpha: 0, duration: 0.15 }, 5.2)
        .fromTo(q(".rp-approved-label"), { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.2 }, 5.3)
        .to(q(".rp-approve-btn"), { backgroundColor: "#E3F1E6", color: "#1F6B48", duration: 0.3 }, 5.25)
        .to(q(".rp-cursor"), { autoAlpha: 0, duration: 0.3 }, 5.7);
      status(tl, ".rp-s-ready", ".rp-s-approved", 5.3);
      logAt(tl, 3, 5.3);
      return tl;
    };

    mm.add(MQ.wide, () => {
      const tl = gsap.timeline({
        defaults: { ease: "power2.out" },
        scrollTrigger: { trigger: q(".rp-stage")[0], start: "top top", end: "+=2800", scrub: 0.8, pin: true },
      });
      build(tl);
      const steps = q(".rp-step");
      tl.set(steps.slice(1), { autoAlpha: 0.3 }, 0);
      [1.3, 2.8, 4.3].forEach((at, i) => tl.to(steps[i], { autoAlpha: 0.3, duration: 0.3 }, at).to(steps[i + 1], { autoAlpha: 1, duration: 0.3 }, at));
      tl.to({}, { duration: 0.8 });
    });
    mm.add(MQ.narrow, () => {
      build(gsap.timeline({ defaults: { ease: "power2.out" }, scrollTrigger: { trigger: q(".rp-console")[0], start: "top 70%" } }));
    });
    mm.add(MQ.reduce, () => {
      gsap.set(q(".rp-approve, .rp-approved-label, .rp-s-approved, .rp-log, .rp-fallback"), { autoAlpha: 1 });
      gsap.set(q(".rp-approve-label, .rp-s-testing, .rp-cursor"), { autoAlpha: 0 });
      gsap.set(q(".rp-bk, .rp-kh"), { opacity: 0.08 });
      gsap.set(q(".rp-node-KOL"), { opacity: 0.35 });
      gsap.set(q(".rp-node-CHE"), { opacity: 1 });
    });
  }, { scope: root });

  const node = (n: Node) => (
    <g className={`rp-node-${n.code}`} opacity={n.code === "CHE" ? 0.35 : 1}>
      <g transform={`translate(${n.x} ${n.y}) scale(0.72)`}><Home roof={n.roof} id={`r${n.code}`} /></g>
      <text x={n.x} y={n.y + 24} textAnchor="middle" fontSize="15" fontWeight="800" fill="#102A24" style={{ fontFamily: "var(--font-sans)" }}>{n.city}</text>
      <text x={n.x} y={n.y + 40} textAnchor="middle" fontSize="11.5" fontWeight="700" fill="#78857D" style={{ fontFamily: "var(--font-sans)" }}>{n.pair}</text>
    </g>
  );
  const STATUS: [string, string, string, string][] = [
    ["rp-s-testing", "Lab tests running", "#DCE9DE", "#183B32"],
    ["rp-s-broken gsap-reveal", "Link failed", "#F8E6E3", "#9E4238"],
    ["rp-s-search gsap-reveal", "Searching", "#FBF1DE", "#8A5A12"],
    ["rp-s-ready gsap-reveal", "Repair ready", "#FBF1DE", "#8A5A12"],
    ["rp-s-approved gsap-reveal", "Approved", "#E3F1E6", "#1F6B48"],
  ];

  return (
    <section ref={root} id="repair" className="k-night relative">
      <Edge flip color="#F7F6F0" seed={17} />
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        {[[6, 12, 6], [18, 70, 4], [44, 8, 5], [62, 88, 4], [90, 20, 6], [80, 60, 3], [30, 40, 3]].map(([l, t, r], i) => (
          <svg key={i} className="absolute" style={{ left: `${l}%`, top: `${t}%` }} width={r * 4} height={r * 4} viewBox="-12 -12 24 24"><Sparkle r={10} fill="#4E8A72" /></svg>
        ))}
      </div>
      <div className="rp-stage relative mx-auto max-w-7xl px-4 sm:px-6 py-24 lg:py-0 lg:h-screen grid lg:grid-cols-[0.85fr_1.15fr] gap-10 lg:gap-14 items-center">
        <div>
          <h2 className="k-serif text-4xl sm:text-5xl xl:text-[3.2rem] leading-[1.05]">
            Swaps rarely fail at the match. <span className="italic" style={{ color: "#A6D8B5" }}>They fail after it.</span>
          </h2>
          <ol className="mt-8 space-y-4 xl:space-y-5">
            {STEPS.map((s) => (
              <li key={s.h} className="rp-step">
                <h3 className="k-serif text-xl xl:text-2xl">{s.h}</h3>
                <p className="mt-1 text-[0.95rem] leading-relaxed max-w-md font-semibold" style={{ color: "#C9D8CD" }}>{s.p}</p>
              </li>
            ))}
          </ol>
        </div>

        <div className="rp-console overflow-hidden rounded-[32px]" style={{ background: "#F7F6F0", color: "#102A24", boxShadow: "0 30px 60px -30px rgba(5,20,16,0.7)" }}>
          <div className="flex items-center justify-between gap-3 px-5 sm:px-6 pt-5">
            <p className="k-serif text-xl">Swap S-0031 <span className="text-base font-semibold" style={{ color: "#78857D", fontFamily: "var(--font-sans)" }}>· three families</span></p>
            <div className="relative h-7 w-36 text-xs font-extrabold">
              {STATUS.map(([c, label, bg, fg]) => (
                <span key={label} className={`${c} absolute right-0 top-0 rounded-full px-3 py-1.5 whitespace-nowrap`} style={{ background: bg, color: fg }}>{label}</span>
              ))}
            </div>
          </div>

          <div className="relative px-2 sm:px-4">
            <svg viewBox="0 0 520 390" className="w-full h-auto lg:max-h-[46vh]" role="img"
                 aria-label="The Hyderabad, Bengaluru and Kolkata loop. The Bengaluru to Kolkata lab test is positive, so KindRed ties in Chennai's family instead and a coordinator approves.">
              {[0, 1].map((i) => <circle key={i} className="rp-ring gsap-reveal" cx={BK.mid[0]} cy={BK.mid[1]} r="230" fill="rgba(166,216,181,0.14)" stroke="#A6D8B5" strokeWidth="2" />)}
              <path className="rp-fallback gsap-reveal" d={FALLBACK.d} fill="none" stroke="#A9C3AF" strokeWidth="2.5" strokeDasharray="2 8" strokeLinecap="round" />
              <path d={HB.d} fill="none" stroke="url(#k-ribbon)" strokeWidth="6" strokeLinecap="round" />
              <path className="rp-bk" d={BK.d} fill="none" stroke="url(#k-ribbon)" strokeWidth="6" strokeLinecap="round" />
              <path className="rp-kh" d={KH.d} fill="none" stroke="url(#k-ribbon)" strokeWidth="6" strokeLinecap="round" />
              <path className="rp-new" d={BC.d} fill="none" stroke="#2C5A4B" strokeWidth="6" strokeLinecap="round" />
              <path className="rp-new" d={CH.d} fill="none" stroke="#2C5A4B" strokeWidth="6" strokeLinecap="round" />
              <g className="rp-fail gsap-reveal" transform={`translate(${BK.mid[0]} ${BK.mid[1]})`}>
                <rect x="-62" y="-16" width="124" height="32" rx="16" fill="#F8E6E3" stroke="#B4564C" strokeWidth="2" />
                <text y="5" textAnchor="middle" fontSize="13" fontWeight="800" fill="#9E4238" style={{ fontFamily: "var(--font-sans)" }}>DQ7 positive</text>
              </g>
              {node(N.HYD)}{node(N.BLR)}{node(N.KOL)}{node(N.CHE)}
            </svg>

            <div className="rp-approve gsap-reveal absolute right-4 sm:right-6 bottom-2">
              <span className="rp-approve-btn relative inline-flex items-center rounded-full px-5 py-2.5 text-sm font-extrabold" style={{ background: "#183B32", color: "#F7F6F0" }}>
                <span className="rp-approve-label">Approve repair</span>
                <span className="rp-approved-label gsap-reveal absolute inset-0 flex items-center justify-center">Approved</span>
              </span>
              <svg className="rp-cursor gsap-reveal absolute -right-2 -bottom-4 w-6 h-6" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M4 2 L4 19 L8.5 14.8 L11.5 21.5 L14.2 20.3 L11.3 13.8 L17.5 13.8 Z" fill="#fff" stroke="#102A24" strokeWidth="1.4" strokeLinejoin="round" />
              </svg>
            </div>
          </div>

          <ul className="mx-3 sm:mx-4 mb-4 mt-1 rounded-[22px] px-4 sm:px-5 py-4 space-y-2 min-h-[13.5rem] text-[0.8rem] sm:text-[0.85rem]" style={{ background: "#EFEEE6" }}>
            {LOG.map((l, i) => (
              <li key={i} className={`rp-log rp-log-${l.step} gsap-reveal flex items-baseline gap-3`}>
                <span className="w-[4.6rem] shrink-0 font-extrabold" style={{ color: l.tone }}>{l.tag}</span>
                <span className="font-semibold tabular-nums" style={{ color: "#183B32" }}>{l.text}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <Edge color="#F7F6F0" seed={21} />
    </section>
  );
}

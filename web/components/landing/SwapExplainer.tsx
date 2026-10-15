"use client";
import { useRef } from "react";
import { gsap, MQ, useGSAP } from "./gsap";
import { KidneyToken, Person } from "./paint";

type Who = { skin: string; hair: string; shirt: string; style: "short" | "long" | "bun" | "curly" };
const FAMILIES: { id: string; city: string; cx: number; cy: number; card: string; rel: string; why: string; patient: Who; donor: Who }[] = [
  { id: "hyd", city: "Hyderabad", cx: 300, cy: 96, card: "#F1EEDC", rel: "his wife", why: "Blood groups don't match",
    patient: { skin: "#B9785A", hair: "#2A2420", shirt: "#4E8A72", style: "short" }, donor: { skin: "#C98B6B", hair: "#3A2A22", shirt: "#C96E64", style: "long" } },
  { id: "blr", city: "Bengaluru", cx: 480, cy: 326, card: "#E1ECE6", rel: "her brother", why: "Antibodies would reject it",
    patient: { skin: "#A8694F", hair: "#2A2420", shirt: "#4E8A72", style: "bun" }, donor: { skin: "#9C5E45", hair: "#231C18", shirt: "#D4927F", style: "short" } },
  { id: "kol", city: "Kolkata", cx: 120, cy: 326, card: "#DCE9DE", rel: "his mother", why: "Blood groups don't match",
    patient: { skin: "#D7A07F", hair: "#3A2A22", shirt: "#A6D8B5", style: "curly" }, donor: { skin: "#C68B6E", hair: "#4A382C", shirt: "#4E8A72", style: "bun" } },
];
const P = (f: { cx: number; cy: number }) => [f.cx - 36, f.cy - 4] as const;
const D = (f: { cx: number; cy: number }) => [f.cx + 36, f.cy - 4] as const;

// Each donor's kidney goes to the next family's patient: Hyderabad → Bengaluru → Kolkata → Hyderabad.
const RIBBONS = [
  { d: "M380,90 Q482,114 444,262", end: [444, 262], ctrl: [482, 114] },
  { d: "M516,390 Q300,500 84,390", end: [84, 390], ctrl: [300, 500] },
  { d: "M156,262 Q118,114 220,90", end: [220, 90], ctrl: [118, 114] },
];
const angle = (a: { end: number[]; ctrl: number[] }) => Math.round((Math.atan2(a.end[1] - a.ctrl[1], a.end[0] - a.ctrl[0]) * 180) / Math.PI);

const STEPS = [
  { h: "Willing, but the wrong match.", p: "Each family has someone ready to donate, but not to their own patient. The blood group is wrong, or the patient carries antibodies that would reject the kidney." },
  { h: "One pool, many hospitals.", p: "One hospital rarely has the right families at the same time. KindRed shares only the medical facts matching needs across hospitals. Names stay with each family's own hospital." },
  { h: "The loop closes.", p: "Each donor gives to the next family's patient. Three families, three kidneys that fit, and nobody donates unless their own patient receives one too." },
];

export default function SwapExplainer() {
  const root = useRef<HTMLElement>(null);

  useGSAP(() => {
    const q = gsap.utils.selector(root);
    const mm = gsap.matchMedia();

    const build = (tl: gsap.core.Timeline) => {
      tl.to(q(".sx-hospital"), { autoAlpha: 0, scale: 0.95, transformOrigin: "50% 50%", duration: 0.6 }, 1)
        .fromTo(q(".sx-pool"), { drawSVG: "0%" }, { drawSVG: "100%", duration: 1.1 }, 1.1)
        .fromTo(q(".sx-pool-label"), { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.4 }, 1.7)
        .to(q(".sx-tear"), { autoAlpha: 0, duration: 0.4 }, 2.6)
        .to(q(".sx-why"), { opacity: 0.4, duration: 0.4 }, 2.6)
        .fromTo(q(".sx-ribbon"), { drawSVG: "0%" }, { drawSVG: "100%", duration: 0.8, stagger: 0.5, ease: "power2.inOut" }, 2.8)
        .fromTo(q(".sx-head"), { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.2, stagger: 0.5 }, 3.45);
      q(".sx-token").forEach((tok, i) => {
        const path = q(".sx-ribbon")[i] as unknown as SVGPathElement;
        tl.set(tok, { autoAlpha: 1 }, 2.8 + i * 0.5)
          .to(tok, { motionPath: { path, align: path, alignOrigin: [0.5, 0.5] }, duration: 0.9, ease: "power1.inOut" }, "<")
          .to(tok, { autoAlpha: 0, duration: 0.15 })
          .fromTo(q(".sx-heart")[(i + 1) % 3], { autoAlpha: 0, scale: 0, transformOrigin: "50% 50%" }, { autoAlpha: 1, scale: 1, duration: 0.4, ease: "back.out(3)" }, "<");
      });
      tl.fromTo(q(".sx-done"), { autoAlpha: 0, y: 10 }, { autoAlpha: 1, y: 0, duration: 0.5 }, ">-0.1");
      return tl;
    };

    mm.add(MQ.wide, () => {
      const tl = gsap.timeline({
        defaults: { ease: "power2.out" },
        scrollTrigger: { trigger: q(".sx-stage")[0], start: "top top", end: "+=2200", scrub: 0.8, pin: true },
      });
      build(tl);
      const steps = q(".sx-step"), dots = q(".sx-dot");
      tl.set(steps.slice(1), { autoAlpha: 0 }, 0)
        .to(steps[0], { autoAlpha: 0, y: -20, duration: 0.3 }, 0.8)
        .fromTo(steps[1], { autoAlpha: 0, y: 20 }, { autoAlpha: 1, y: 0, duration: 0.3 }, 1.0)
        .to(steps[1], { autoAlpha: 0, y: -20, duration: 0.3 }, 2.5)
        .fromTo(steps[2], { autoAlpha: 0, y: 20 }, { autoAlpha: 1, y: 0, duration: 0.3 }, 2.7)
        .to(dots[0], { width: 10, backgroundColor: "#B9D3BF", duration: 0.2 }, 0.9)
        .to(dots[1], { width: 34, backgroundColor: "#183B32", duration: 0.2 }, 0.9)
        .to(dots[1], { width: 10, backgroundColor: "#B9D3BF", duration: 0.2 }, 2.6)
        .to(dots[2], { width: 34, backgroundColor: "#183B32", duration: 0.2 }, 2.6)
        .to({}, { duration: 0.6 });
    });

    mm.add(MQ.narrow, () => {
      build(gsap.timeline({ defaults: { ease: "power2.out" }, scrollTrigger: { trigger: q(".sx-svg")[0], start: "top 70%" } }));
    });

    mm.add(MQ.reduce, () => {
      gsap.set(q(".sx-hospital, .sx-tear, .sx-token"), { autoAlpha: 0 });
      gsap.set(q(".sx-head, .sx-heart, .sx-done, .sx-pool-label"), { autoAlpha: 1 });
    });
  }, { scope: root });

  return (
    <section ref={root} id="how" className="relative">
      <div className="sx-stage mx-auto max-w-7xl px-4 sm:px-6 py-24 lg:py-0 lg:h-screen grid lg:grid-cols-[0.85fr_1.15fr] gap-10 lg:gap-16 items-center">
        <div>
          <h2 className="k-serif text-4xl sm:text-[3.4rem] leading-[1.05]">How a swap works</h2>
          <div className="hidden lg:flex mt-6 gap-1.5" aria-hidden="true">
            {STEPS.map((_, i) => <span key={i} className="sx-dot block h-2.5 rounded-full" style={{ width: i ? 10 : 34, background: i ? "#B9D3BF" : "#183B32" }} />)}
          </div>
          <div className="mt-8 lg:relative lg:h-[230px] space-y-8 lg:space-y-0">
            {STEPS.map((s) => (
              <div key={s.h} className="sx-step lg:absolute lg:inset-x-0 lg:top-0">
                <h3 className="k-serif text-2xl sm:text-3xl">{s.h}</h3>
                <p className="k-body mt-3 text-lg leading-relaxed max-w-md">{s.p}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-[36px] p-3 sm:p-6" style={{ background: "#EFEEE6" }}>
          <svg className="sx-svg w-full h-auto" viewBox="0 0 600 510" role="img"
               aria-label="Three families, each with a donor who can't give to their own patient, join one pool. Hyderabad's donor gives to Bengaluru's patient, Bengaluru's donor to Kolkata's patient, and Kolkata's donor to Hyderabad's patient.">
            <rect className="sx-pool" x="12" y="12" width="576" height="486" rx="30" fill="none" stroke="#4E8A72" strokeWidth="2" strokeDasharray="2 9" strokeLinecap="round" />
            <text className="sx-pool-label gsap-reveal" x="300" y="490" textAnchor="middle" fontSize="15" fontWeight="800" fill="#2C5A4B" style={{ fontFamily: "var(--font-sans)" }}>
              One shared pool across 11 hospitals
            </text>

            {RIBBONS.map((a, i) => (
              <g key={i}>
                <path className="sx-ribbon" d={a.d} fill="none" stroke="url(#k-ribbon)" strokeWidth="6" strokeLinecap="round" />
                <path className="sx-head gsap-reveal" d="M-11,-8 L2,0 L-11,8" fill="none" stroke="#D4927F" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round"
                      transform={`translate(${a.end[0]} ${a.end[1]}) rotate(${angle(a)})`} />
              </g>
            ))}

            {FAMILIES.map((f) => {
              const [px, py] = P(f), [dx, dy] = D(f);
              return (
                <g key={f.id}>
                  <rect className="sx-hospital" x={f.cx - 94} y={f.cy - 82} width="188" height="166" rx="26" fill="none" stroke="#A9C3AF" strokeWidth="1.5" strokeDasharray="4 6" />
                  <text className="sx-hospital" x={f.cx} y={f.cy - 89} textAnchor="middle" fontSize="12" fontWeight="800" fill="#78857D" style={{ fontFamily: "var(--font-sans)" }}>
                    {f.city} hospital
                  </text>
                  <rect x={f.cx - 80} y={f.cy - 66} width="160" height="132" rx="22" fill={f.card} />
                  <text x={f.cx} y={f.cy - 42} textAnchor="middle" fontSize="16" fill="#183B32" style={{ fontFamily: "var(--font-serif)", fontVariationSettings: '"SOFT" 100' }}>
                    The {f.city} family
                  </text>
                  <g transform={`translate(${px} ${py})`}><Person {...f.patient} /></g>
                  <g transform={`translate(${dx} ${dy})`}><Person {...f.donor} /></g>
                  <g className="sx-heart gsap-reveal" transform={`translate(${px + 16} ${py - 22})`}>
                    <circle r="9" fill="#F7F6F0" />
                    <path d="M0,4 C-6,0 -6,-5 -2.5,-5 C-1,-5 0,-4 0,-3 C0,-4 1,-5 2.5,-5 C6,-5 6,0 0,4 Z" fill="#C96E64" />
                  </g>
                  <text x={px} y={f.cy + 37} textAnchor="middle" fontSize="12" fontWeight="700" fill="#4A5952" style={{ fontFamily: "var(--font-sans)" }}>Patient</text>
                  <text x={dx} y={f.cy + 37} textAnchor="middle" fontSize="12" fontWeight="700" fill="#4A5952" style={{ fontFamily: "var(--font-sans)" }}>{f.rel}</text>
                  <g className="sx-tear" transform={`translate(${f.cx} ${f.cy - 4})`}>
                    <path d="M-12,0 C-8,-3 -4,3 0,0 C4,-3 8,3 12,0" fill="none" stroke="#B4564C" strokeWidth="2.4" strokeLinecap="round" strokeDasharray="3 4" />
                    <circle r="7.5" fill="#F7F6F0" stroke="#B4564C" strokeWidth="2" />
                    <path d="M-2.6,-2.6 L2.6,2.6 M2.6,-2.6 L-2.6,2.6" stroke="#B4564C" strokeWidth="2" strokeLinecap="round" />
                  </g>
                  <text className="sx-why" x={f.cx} y={f.cy + 56} textAnchor="middle" fontSize="12" fontWeight="800" fill="#9E4238" style={{ fontFamily: "var(--font-sans)" }}>
                    {f.why}
                  </text>
                </g>
              );
            })}

            {[0, 1, 2].map((i) => <g key={i} className="sx-token gsap-reveal" filter="url(#k-glow)"><KidneyToken /></g>)}

            <g className="sx-done gsap-reveal">
              <rect x="186" y="200" width="228" height="50" rx="25" fill="#183B32" />
              <text x="300" y="231" textAnchor="middle" fontSize="16" fontWeight="800" fill="#F7F6F0" style={{ fontFamily: "var(--font-sans)" }}>
                Three kidneys that fit
              </text>
            </g>
          </svg>
        </div>
      </div>
    </section>
  );
}

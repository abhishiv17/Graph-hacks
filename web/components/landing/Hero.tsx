"use client";
import Link from "next/link";
import { useRef } from "react";
import { gsap, MQ, SplitText, useGSAP } from "./gsap";
import { brushTop, Cloud, Home, KidneyToken, Sparkle } from "./paint";

// Four family homes on the hills. Roof tops are where the ribbon ties on.
const HOMES = [
  { id: "HYD", city: "Hyderabad", x: 300, y: 470, roof: "#C96E64" },
  { id: "BLR", city: "Bengaluru", x: 720, y: 505, roof: "#4E8A72" },
  { id: "KOL", city: "Kolkata", x: 1130, y: 462, roof: "#D4927F" },
  { id: "CHE", city: "Chennai", x: 930, y: 546, roof: "#4E8A72" },
];
const LOOP = [
  "M300,404 Q480,232 720,439",
  "M720,439 Q930,232 1130,396",
  "M1130,396 Q715,92 300,404",
];
const REPAIR = ["M720,439 Q850,392 930,480", "M930,480 Q600,344 300,404"];
const TEAR_AT = [927, 324];
const STARS = [[140, 120, 5], [420, 80, 4], [610, 150, 3], [880, 70, 5], [1010, 160, 3], [1320, 110, 4], [1220, 300, 3], [80, 330, 3]];

const CAPTIONS = [
  "Three families. Each has a donor who can't give to their own patient.",
  "KindRed finds a cycle: each donor gives to the next family's patient.",
  "Then a lab test fails, and the loop comes undone.",
  "KindRed finds a family nearby. A coordinator approves the change.",
];

export default function Hero() {
  const root = useRef<HTMLElement>(null);

  useGSAP(() => {
    const q = gsap.utils.selector(root);
    const mm = gsap.matchMedia();
    const intro = ".hero-title, .hero-sub, .hero-cta, .hero-scene";

    mm.add(MQ.motion, () => {
      const split = SplitText.create(q(".hero-title")[0], { type: "lines,words", mask: "lines" });
      const tl = gsap.timeline({ defaults: { ease: "expo.out" } });
      tl.set(q(intro), { autoAlpha: 1 })
        .from(split.words, { yPercent: 105, duration: 1.2, stagger: 0.05 })
        .from(q(".hero-sub"), { y: 16, autoAlpha: 0, duration: 1 }, "-=0.85")
        .from(q(".hero-cta > *"), { y: 12, autoAlpha: 0, duration: 0.9, stagger: 0.08 }, "-=0.8")
        .from(q(".hill"), { yPercent: 18, duration: 1.6, stagger: 0.09 }, 0.15)
        .from(q(".k-home"), { y: 30, autoAlpha: 0, duration: 1, stagger: 0.08 }, 0.7)
        .from(q(".k-cloud"), { autoAlpha: 0, duration: 1.6 }, 0.3);

      // Twinkling keeps the sky alive between story beats.
      gsap.to(q(".k-star"), { scale: 0.4, opacity: 0.4, transformOrigin: "50% 50%", duration: 1.4, ease: "sine.inOut", yoyo: true, repeat: -1, stagger: { each: 0.35, from: "random" } });
      // Hills part gently on scroll.
      q(".hill").forEach((h, i) => gsap.to(h, { yPercent: -3 * (i + 1), ease: "none", scrollTrigger: { trigger: root.current, start: "top top", end: "bottom top", scrub: true } }));

      const ribbons = q(".rb-loop");
      const story = gsap.timeline({ repeat: -1, repeatDelay: 0.4, paused: true, defaults: { ease: "power2.inOut" } });
      const caption = (i: number, at: number) => {
        story.to(q(".hero-cap"), { autoAlpha: 0, y: -8, duration: 0.35 }, at)
          .fromTo(q(".hero-cap")[i], { autoAlpha: 0, y: 10 }, { autoAlpha: 1, y: 0, duration: 0.6, ease: "expo.out" }, at + 0.25)
          .to(q(".hero-dot"), { width: 8, backgroundColor: "#B9D3BF", duration: 0.3 }, at)
          .to(q(".hero-dot")[i], { width: 28, backgroundColor: "#183B32", duration: 0.3 }, at);
      };
      story.set(ribbons, { drawSVG: "0%", stroke: "url(#k-ribbon)", strokeDasharray: "none", autoAlpha: 1 })
        .set(q(".rb-repair"), { drawSVG: "0%", autoAlpha: 1 })
        .set(q(".rb-token, .rb-tear"), { autoAlpha: 0 })
        .set(q(".k-window"), { fill: "#F2D59A" })
        .set(q(".k-window-CHE"), { fill: "#9AA79F" })
        .set(q(".k-home-CHE"), { opacity: 0.55 });
      caption(0, 0);
      story.fromTo(q(".k-window-HYD, .k-window-BLR, .k-window-KOL"), { fill: "#F2D59A" }, { fill: "#F7E7BE", duration: 0.35, yoyo: true, repeat: 1, stagger: 0.2 }, 0.6);
      caption(1, 2.4);
      story.to(ribbons, { drawSVG: "100%", duration: 1, stagger: 0.7 }, 2.6);
      q(".rb-token").forEach((tok, i) => {
        const path = ribbons[i] as unknown as SVGPathElement;
        story.set(tok, { autoAlpha: 1 }, 2.7 + i * 0.7)
          .to(tok, { motionPath: { path, align: path, alignOrigin: [0.5, 0.5] }, duration: 1.1, ease: "power1.inOut" }, "<")
          .to(tok, { autoAlpha: 0, duration: 0.2 });
      });
      caption(2, 6.2);
      story.to(ribbons[1], { stroke: "#B4564C", duration: 0.2, repeat: 3, yoyo: true }, 6.5)
        .set(ribbons[1], { stroke: "#B4564C", strokeDasharray: "10 12" }, 7.3)
        .fromTo(q(".rb-tear"), { autoAlpha: 0, scale: 0.3, transformOrigin: "50% 50%" }, { autoAlpha: 1, scale: 1, duration: 0.5, ease: "back.out(3)" }, 7.0)
        .to(ribbons[2], { opacity: 0.25, duration: 0.6 }, 7.3)
        .to(q(".k-window-KOL"), { fill: "#9AA79F", duration: 0.5 }, 7.3);
      caption(3, 9.0);
      story.to(q(".k-home-CHE"), { opacity: 1, duration: 0.5 }, 9.3)
        .to(q(".k-window-CHE"), { fill: "#F2D59A", duration: 0.5 }, 9.4)
        .to(q(".rb-repair"), { drawSVG: "100%", duration: 0.9, stagger: 0.6 }, 9.8)
        .to([ribbons[1], ribbons[2], q(".rb-tear")[0]], { opacity: 0, duration: 0.6 }, 11.0)
        .to({}, { duration: 2.6 })
        .to(q(".rb-loop, .rb-repair"), { autoAlpha: 0, duration: 0.6 });

      tl.add(() => story.play(), 1.4);
      const io = new IntersectionObserver(([e]) => (e.isIntersecting ? story.resume() : story.pause()));
      if (root.current) io.observe(root.current);
      return () => { io.disconnect(); split.revert(); };
    });

    mm.add(MQ.reduce, () => {
      gsap.set(q(intro), { autoAlpha: 1 });
      gsap.set([q(".rb-loop")[1], q(".rb-loop")[2]], { opacity: 0 });
      gsap.set(q(".hero-cap")[3], { autoAlpha: 1 });
    });
  }, { scope: root });

  return (
    <section ref={root} className="relative pt-28 sm:pt-32">
      <div className="relative z-10 mx-auto max-w-4xl px-4 text-center">
        <h1 className="hero-title gsap-reveal k-serif text-[2.5rem] leading-[1.06] sm:text-[3.6rem] lg:text-[4.4rem]" style={{ color: "var(--k-ink)" }}>
          When a donor can&rsquo;t match their intended recipient, KindRed finds another possibility.
        </h1>
        <p className="hero-sub gsap-reveal k-body mx-auto mt-7 max-w-2xl text-lg sm:text-xl leading-relaxed">
          KindRed connects living donor–recipient pairs across transplant programs, helping teams discover exchange
          possibilities, coordinate review, and recover when a proposed pathway changes.
        </p>
        <div className="hero-cta gsap-reveal mt-9 flex flex-wrap justify-center gap-3">
          <Link href="/pool" className="k-btn k-btn-primary">Open the workspace</Link>
          <a href="#how" className="k-btn k-btn-line">How a swap works</a>
        </div>
        <ul className="hero-cta gsap-reveal mt-7 flex flex-wrap justify-center gap-3" aria-label="Programs on the platform">
          {[["Kidney", "#2C5A4B", "#DCE9DE"], ["Liver", "#9A6A2C", "#F3E6D2"]].map(([k, c, bg]) => (
            <li key={k}>
              <a href="#programs" className="inline-flex items-center gap-2.5 rounded-full px-4 py-2 text-left" style={{ background: bg }}>
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: c }} aria-hidden="true" />
                <span className="text-sm font-extrabold uppercase tracking-[0.12em]" style={{ color: c }}>{k}</span>
                <span className="text-sm font-semibold" style={{ color: "#34433D" }}>Paired donation</span>
              </a>
            </li>
          ))}
        </ul>
      </div>

      <div className="relative z-10 mt-9 px-4 text-center" aria-live="off">
        <div className="relative mx-auto h-16 sm:h-[4.2rem] max-w-2xl">
          {CAPTIONS.map((c, i) => (
            <p key={i} className="hero-cap gsap-reveal absolute inset-x-0 top-0 k-serif italic text-lg sm:text-[1.6rem] leading-snug" style={{ color: "var(--forest-mid)" }}>{c}</p>
          ))}
        </div>
        <div className="mt-2 flex justify-center gap-1.5" aria-hidden="true">
          {CAPTIONS.map((_, i) => <span key={i} className="hero-dot block h-2 w-2 rounded-full" style={{ background: "#B9D3BF" }} />)}
        </div>
      </div>

      <div className="hero-scene gsap-reveal relative overflow-hidden -mt-2 sm:-mt-14">
        <svg viewBox="0 185 1440 455" preserveAspectRatio="xMidYMax slice" className="block h-auto max-w-none w-[150%] -ml-[25%] sm:w-full sm:ml-0"
             role="img" aria-label="An example from the kidney program: an illustrated landscape with family homes in Hyderabad, Bengaluru and Kolkata tied together by a ribbon. The ribbon between Bengaluru and Kolkata tears when a lab test fails, and a new ribbon ties Bengaluru to Chennai and Chennai back to Hyderabad.">
          <circle cx="1150" cy="380" r="200" fill="url(#k-sun)" />
          {STARS.map(([x, y, r], i) => <g key={i} className="k-star" transform={`translate(${x} ${y})`}><Sparkle r={r} fill="#B9D3BF" /></g>)}
          <Cloud className="k-cloud" x={230} y={260} s={0.95} fill="#EAF1E8" />
          <Cloud className="k-cloud" x={1270} y={200} s={0.8} fill="#F2EBDF" />
          <Cloud className="k-cloud" x={760} y={175} s={0.62} fill="#F1F5EE" />
          <g transform="translate(110 222)">
            <rect x="0" y="-19" width="218" height="30" rx="15" fill="#F7F6F0" opacity="0.92" />
            <circle cx="18" cy="-4" r="5" fill="#2C5A4B" />
            <text x="31" y="1" fontSize="14" fontWeight="800" letterSpacing="1.6" fill="#183B32" style={{ fontFamily: "var(--font-sans)" }}>KIDNEY PROGRAM · EXAMPLE</text>
          </g>

          <path className="hill" d={brushTop(1440, 700, 388, 30, 2)} fill="#DCE9DE" />
          <path className="hill" d={brushTop(1440, 700, 452, 26, 5)} fill="#B9D3BF" />

          {LOOP.map((d, i) => <path key={i} className="rb-loop" d={d} fill="none" stroke="url(#k-ribbon)" strokeWidth="7" strokeLinecap="round" filter="url(#k-glow)" />)}
          {REPAIR.map((d, i) => <path key={i} className="rb-repair" d={d} fill="none" stroke="url(#k-ribbon)" strokeWidth="7" strokeLinecap="round" filter="url(#k-glow)" />)}

          <path className="hill" d={brushTop(1440, 700, 528, 20, 9)} fill="#6E9E86" />
          {HOMES.map((h) => (
            <g key={h.id} className={`k-home k-home-${h.id}`}>
              <g transform={`translate(${h.x} ${h.y})`}><Home roof={h.roof} id={h.id} /></g>
              <text x={h.x} y={h.y + 30} textAnchor="middle" fontSize="19" fontWeight="800" fill="#102A24" style={{ fontFamily: "var(--font-sans)" }}>{h.city}</text>
            </g>
          ))}
          <path className="hill" d={brushTop(1440, 700, 622, 10, 13)} fill="#102A24" />

          {[0, 1, 2].map((i) => <g key={i} className="rb-token gsap-reveal" filter="url(#k-glow)"><KidneyToken /></g>)}
          <g className="rb-tear gsap-reveal" transform={`translate(${TEAR_AT[0]} ${TEAR_AT[1]})`}>
            <circle r="17" fill="#F7F6F0" stroke="#B4564C" strokeWidth="3" />
            <path d="M-6 -6 L6 6 M6 -6 L-6 6" stroke="#B4564C" strokeWidth="3.4" strokeLinecap="round" />
          </g>
        </svg>
      </div>
    </section>
  );
}

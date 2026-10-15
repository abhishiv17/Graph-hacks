"use client";
import { useRef } from "react";
import { gsap, MQ, useGSAP } from "./gsap";
import { LogoMark } from "@/components/Logo";

/**
 * Reserved slot for the product demo video. Until the real files exist it shows a still placeholder
 * (no play button, nothing that pretends to be playable).
 *
 * To add the video, place the files in web/public and pass them in:
 *   <VideoShowcase src="/videos/kindred-product-demo.mp4" poster="/images/kindred-product-poster.webp" />
 */
export default function VideoShowcase({ src, poster }: { src?: string; poster?: string }) {
  const root = useRef<HTMLElement>(null);
  useGSAP(() => {
    gsap.matchMedia().add(MQ.motion, () => {
      gsap.from(root.current!.querySelector(".vs-frame"), { y: 40, autoAlpha: 0, duration: 1.1, ease: "expo.out", scrollTrigger: { trigger: root.current, start: "top 80%", once: true } });
    });
  }, { scope: root });

  return (
    <section ref={root} id="demo" className="k-night relative -mt-px">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 pt-14 pb-20 sm:pt-20 sm:pb-24">
        <div className="max-w-2xl">
          <h2 className="k-serif text-[2.2rem] sm:text-5xl leading-[1.06]">One connected view. Every decision accounted for.</h2>
          <p className="mt-4 text-lg leading-relaxed" style={{ color: "#C9D8CD" }}>
            See how exchange discovery, evidence review, and recovery workflows come together in one coordinated workspace.
          </p>
        </div>
        <div className="vs-frame mt-10 overflow-hidden rounded-2xl border" style={{ borderColor: "rgba(166,216,181,0.22)", background: "#0B201B" }}>
          <div className="relative aspect-video">
            {src ? (
              <video className="absolute inset-0 h-full w-full object-cover" controls preload="metadata" playsInline poster={poster}>
                <source src={src} type="video/mp4" />
                Your browser can&rsquo;t play this video.
              </video>
            ) : <Placeholder />}
          </div>
        </div>
      </div>
    </section>
  );
}

/** A quiet still of the workspace's shape, with a clear note that the demo video goes here. */
function Placeholder() {
  return (
    <div className="absolute inset-0" role="img" aria-label="Placeholder for the KindRed product demo video, which will be added here.">
      <svg viewBox="0 0 1600 900" className="absolute inset-0 h-full w-full" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <rect width="1600" height="900" fill="#0E2520" />
        {/* app chrome */}
        <rect x="0" y="0" width="300" height="900" fill="#0B1E19" />
        {[150, 205, 260, 315, 370, 425, 480].map((y, i) => <rect key={y} x="42" y={y} width={i === 1 ? 190 : 150 - (i % 3) * 18} height="14" rx="7" fill={i === 1 ? "#A6D8B5" : "#2A443C"} opacity={i === 1 ? 0.75 : 1} />)}
        <rect x="300" y="0" width="1300" height="80" fill="#10291F" />
        <rect x="350" y="30" width="260" height="20" rx="10" fill="#2A443C" />
        <rect x="1330" y="26" width="220" height="28" rx="14" fill="#2A443C" />
        {/* map panel */}
        <rect x="350" y="130" width="560" height="700" rx="16" fill="#123029" />
        <path d="M520 220 L600 180 L700 230 L760 330 L800 460 L740 600 L660 720 L600 780 L560 700 L520 560 L470 450 L450 330 Z" fill="#1A3B32" stroke="#2C5A4B" strokeWidth="3" />
        <path d="M600 470 Q650 380 760 420 Q720 520 600 470 M600 470 Q560 560 640 600" fill="none" stroke="#A6D8B5" strokeWidth="5" strokeLinecap="round" opacity="0.9" />
        {[[600, 470], [760, 420], [640, 600], [560, 300], [690, 320]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r={i < 3 ? 11 : 7} fill={i < 3 ? "#F7F6F0" : "#2C5A4B"} />)}
        {/* list + graph panels */}
        <rect x="950" y="130" width="600" height="330" rx="16" fill="#123029" />
        {[175, 230, 285, 340, 395].map((y, i) => (
          <g key={y}><rect x="985" y={y} width="300" height="16" rx="8" fill="#2A443C" /><rect x="1440" y={y - 4} width="76" height="24" rx="12" fill={i === 0 ? "#C96E64" : "#2C5A4B"} opacity={i === 0 ? 0.85 : 1} /></g>
        ))}
        <rect x="950" y="500" width="600" height="330" rx="16" fill="#123029" />
        <g transform="translate(1250 665)">
          <path d="M-130 -60 Q0 -150 130 -60 M130 -60 Q120 90 0 100 M0 100 Q-120 90 -130 -60" fill="none" stroke="#6FAE86" strokeWidth="5" strokeLinecap="round" />
          <path d="M130 -60 Q120 90 0 100" fill="none" stroke="#C96E64" strokeWidth="5" strokeDasharray="14 12" strokeLinecap="round" />
          {[[-130, -60], [130, -60], [0, 100]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r="30" fill="#F7F6F0" stroke="#183B32" strokeWidth="4" />)}
        </g>
      </svg>
      <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse at center, rgba(11,32,27,0.55) 0%, rgba(11,32,27,0.82) 70%)" }} />
      <div className="absolute inset-0 grid place-items-center p-6 text-center">
        <div>
          <span className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-full border" style={{ borderColor: "rgba(166,216,181,0.35)", background: "rgba(16,42,36,0.8)" }}>
            <LogoMark size={34} tone="dark" />
          </span>
          <p className="text-lg sm:text-xl font-semibold" style={{ color: "#F7F6F0" }}>Product demo video</p>
          <p className="mt-1 text-sm" style={{ color: "#A3B8AB" }}>Coming soon. A walkthrough of discovery, evidence review and recovery will play here.</p>
        </div>
      </div>
    </div>
  );
}

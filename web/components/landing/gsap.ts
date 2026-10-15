"use client";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";
import { DrawSVGPlugin } from "gsap/DrawSVGPlugin";
import { MotionPathPlugin } from "gsap/MotionPathPlugin";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(ScrollTrigger, SplitText, DrawSVGPlugin, MotionPathPlugin, useGSAP);

// Shared media conditions: full motion, reduced motion, and wide screens (where sections pin).
export const MQ = {
  motion: "(prefers-reduced-motion: no-preference)",
  reduce: "(prefers-reduced-motion: reduce)",
  wide: "(min-width: 1024px) and (prefers-reduced-motion: no-preference)",
  narrow: "(max-width: 1023px) and (prefers-reduced-motion: no-preference)",
};

export { gsap, ScrollTrigger, SplitText, useGSAP };

"use client";
// Small helpers that make the workspace self-explaining: dotted terms with a definition,
// and a "what is this screen" note at the top of each page.
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "./icons";
import { GLOSSARY, type GlossaryKey } from "@/lib/glossary";

/** A word with a dotted underline; hover, focus or tap it to read what it means. The definition is drawn at the page
 * level, fixed to the screen, so a card that clips its contents (rounded corners, overflow hidden) can't cut it off. It
 * opens above the word, below it when there's no room, and always stays inside the screen. */
export function Term({ k, children, dark }: { k: GlossaryKey; children: React.ReactNode; dark?: boolean }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const btn = useRef<HTMLButtonElement>(null);
  const tip = useRef<HTMLSpanElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  useLayoutEffect(() => {
    if (!open || !btn.current || !tip.current) { setPos(null); return; }
    const place = () => {
      const b = btn.current!.getBoundingClientRect();
      const t = tip.current!.getBoundingClientRect();
      const gap = 8, edge = 8, header = 72;  // the sticky top bar covers the first ~64px
      const above = b.top - t.height - gap;
      const top = above >= header ? above : b.bottom + gap;
      // clientWidth, not innerWidth: the vertical scrollbar would otherwise hide the right edge of the box.
      const left = Math.min(Math.max(b.left + b.width / 2 - t.width / 2, edge), document.documentElement.clientWidth - t.width - edge);
      setPos({ left, top });
    };
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => { window.removeEventListener("scroll", place, true); window.removeEventListener("resize", place); };
  }, [open]);
  return (
    <span className="relative inline-block">
      <button ref={btn} type="button" aria-describedby={open ? id : undefined} onClick={() => setOpen((o) => !o)}
              onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)} onFocus={() => setOpen(true)} onBlur={() => setOpen(false)}
              className="underline decoration-dotted underline-offset-[3px] cursor-help"
              style={{ textDecorationColor: dark ? "rgba(207,227,214,0.6)" : "var(--line-strong)" }}>
        {children}
      </button>
      {open && typeof document !== "undefined" && createPortal(
        <span role="tooltip" id={id} ref={tip}
              className="fixed z-[80] w-64 max-w-[calc(100vw-1rem)] rounded-lg px-3 py-2 text-xs font-normal leading-relaxed normal-case tracking-normal text-left shadow-lg pointer-events-none"
              style={{ left: pos?.left ?? -9999, top: pos?.top ?? -9999, background: "#0F2621", color: "#E6F0EA", border: "1px solid rgba(166,216,181,0.25)" }}>
          {GLOSSARY[k]}
        </span>,
        document.body,
      )}
    </span>
  );
}

/** "What is this screen?" Open the first time; once closed it stays closed in this browser. */
export function PageIntro({ id, what, steps }: { id: string; what: React.ReactNode; steps?: React.ReactNode[] }) {
  const key = `kindred.intro.${id}`;
  const [open, setOpen] = useState(true);
  useEffect(() => { try { if (localStorage.getItem(key) === "closed") setOpen(false); } catch { /* storage blocked */ } }, [key]);
  const toggle = () => {
    setOpen((o) => {
      try { localStorage.setItem(key, o ? "closed" : "open"); } catch { /* storage blocked */ }
      return !o;
    });
  };
  if (!open) return (
    <button className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium" style={{ color: "var(--forest)" }} onClick={toggle}>
      <Icon name="info" size={15} /> What is this screen?
    </button>
  );
  return (
    <aside className="mb-6 rounded-[12px] border px-5 py-4" style={{ background: "var(--sage-pale)", borderColor: "var(--line)" }} aria-label="About this screen">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 shrink-0" style={{ color: "var(--forest)" }}><Icon name="info" size={18} /></span>
        <div className="min-w-0 flex-1">
          <p className="text-[0.95rem]" style={{ color: "var(--ink-strong)" }}>{what}</p>
          {steps && steps.length > 0 && (
            <ol className="mt-2.5 grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3 text-sm muted">
              {steps.map((s, i) => (
                <li key={i} className="flex gap-2">
                  <span className="shrink-0 h-5 w-5 rounded-full grid place-items-center text-[0.7rem] font-bold" style={{ background: "var(--surface)", color: "var(--forest)" }}>{i + 1}</span>
                  <span>{s}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
        <button className="shrink-0 text-sm font-medium" style={{ color: "var(--forest)" }} onClick={toggle} aria-label="Hide this note">Hide</button>
      </div>
    </aside>
  );
}

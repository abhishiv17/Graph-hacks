"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "./icons";
import { Logo } from "@/components/Logo";
import KinGuide from "./KinGuide";
import { DataProvider, useData, useResource } from "@/lib/data/source";
import { fmtTime, loopRoute } from "@/lib/data/derive";
import { ProgramProvider, useProgram, type ProgramKey } from "@/lib/program";
import { ORGANS, ORGAN_NAMES, organOf } from "@/lib/organs";
import { gsap, useGSAP } from "@/components/landing/gsap";

// Five places to go, named for what you do there. Everything else waits under "More" so the first look stays simple.
export const NAV_MAIN = [
  { href: "/patients", label: "Patients" },
  { href: "/swaps", label: "Swaps" },
  { href: "/pool", label: "Live map" },
  { href: "/ask", label: "Ask KindRed" },
  { href: "/graph", label: "How it works" },
];
export const NAV_MORE = [
  { href: "/committee", label: "Committee review", sub: "Which paper holds each swap up" },
  { href: "/integrity", label: "Integrity checks", sub: "Data and workflow checks" },
  { href: "/audit", label: "Audit trail", sub: "Every agent action and human decision" },
  { href: "/impact", label: "Impact", sub: "A simulated year, four policies" },
  { href: "/lab", label: "Scenario replay", sub: "Each program's story, step by step" },
];
export const NAV = [...NAV_MAIN, ...NAV_MORE];
// Screens where the kidney / liver / all choice changes what you see.
const PROGRAM_PAGES = ["/pool", "/swaps", "/committee", "/integrity", "/audit", "/lab", "/impact"];

function crumbs(path: string): { label: string; href?: string }[] {
  const seg = path.split("/").filter(Boolean);
  if (seg.length < 2) return [];
  if (seg[0] === "case") return [{ label: "Family view" }, { label: seg[1] }];
  if (seg[0] === "patients") return [{ label: "Patients", href: "/patients" }, { label: seg[1][0].toUpperCase() + seg[1].slice(1) }];
  if (seg[0] === "families") return [{ label: "Patients", href: "/patients" }, { label: decodeURIComponent(seg[1]).toUpperCase() }];
  const base = NAV.find((n) => path.startsWith(n.href + "/"));
  return base ? [{ label: base.label, href: base.href }, { label: decodeURIComponent(seg[1]) }] : [];
}
const isActive = (path: string, href: string) => path === href || path.startsWith(href + "/") || (href === "/patients" && path.startsWith("/families/"));

/** One platform, two programs: a small switch, shown only where it changes what you see. */
function ProgramToggle({ className = "" }: { className?: string }) {
  const { program, setProgram } = useProgram();
  const opts: { key: ProgramKey; label: string; dot?: string }[] = [
    ...ORGAN_NAMES.map((o) => ({ key: o as ProgramKey, label: ORGANS[o].label, dot: ORGANS[o].line })),
    { key: "all", label: "Both" },
  ];
  return (
    <div className={`inline-flex rounded-full border p-0.5 ${className}`} style={{ borderColor: "var(--line)", background: "var(--surface)" }} role="radiogroup" aria-label="Program">
      {opts.map((o) => {
        const on = program === o.key;
        return (
          <button key={o.key} role="radio" aria-checked={on} onClick={() => setProgram(o.key)}
                  className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition-colors"
                  style={{ background: on ? "var(--forest)" : "transparent", color: on ? "#fff" : "var(--ink)" }}>
            {o.dot && <span className="h-1.5 w-1.5 rounded-full" style={{ background: o.dot }} aria-hidden="true" />}{o.label}
          </button>
        );
      })}
    </div>
  );
}

function Popover({ children, onClose, align = "right", width = "w-80" }: { children: React.ReactNode; onClose: () => void; align?: "right" | "left"; width?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.parentElement?.contains(e.target as Node)) onClose(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [onClose]);
  return (
    <div ref={ref} className={`absolute ${align === "right" ? "right-0" : "left-0"} top-full mt-2 z-50 ${width} max-w-[calc(100vw-2rem)] rounded-xl border p-3 shadow-[0_12px_32px_-12px_rgba(16,42,36,0.35)]`}
         style={{ background: "var(--surface)", borderColor: "var(--line)" }}>
      {children}
    </div>
  );
}

/** Only says something when it matters: the API is unreachable and screens show the recorded snapshot. */
function OfflineChip() {
  const { mode, retryLive } = useData();
  if (mode !== "offline") return null;
  return (
    <button className="hidden sm:inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold" style={{ borderColor: "#ecd9b4", background: "var(--warn-soft)", color: "var(--warn)" }}
            onClick={() => retryLive()} title="The API isn't responding; showing the last recorded state. Click to reconnect.">
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--warn-mark)" }} /> Offline · reconnect
    </button>
  );
}

/** The human in the loop, made visible: repairs waiting for a person's approval and papers that are overdue. */
function NeedsAPerson() {
  const pool = useResource("pool", (a) => a.pool(), 5000);
  const { includes } = useProgram();
  const [open, setOpen] = useState(false);
  const organOfLoop = (id: string) => pool.data?.loops.find((l) => l.loop_id === id)?.organ;
  const tasks = (pool.data?.open_tasks ?? []).filter((t) => includes(organOfLoop(t.loop_id)));
  const esc = (pool.data?.escalations ?? []).filter((e) => includes(organOfLoop(e.loop_id)));
  const count = tasks.length + esc.length;
  if (!pool.data) return null;
  return (
    <div className="relative">
      <button className="inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold whitespace-nowrap" onClick={() => setOpen((o) => !o)} aria-expanded={open}
              style={count ? { borderColor: "#efc9c3", background: "var(--bad-soft)", color: "var(--bad)" } : { borderColor: "var(--line)", background: "var(--surface)", color: "var(--muted)" }}
              title="Agents never approve a repair or a surgery on their own. These are waiting for a person.">
        <Icon name="user" size={14} />{count ? `${count} need${count === 1 ? "s" : ""} a person` : "Nothing waiting"}
      </button>
      {open && (
        <Popover onClose={() => setOpen(false)}>
          <p className="px-1 text-sm font-semibold" style={{ color: "var(--ink-strong)" }}>Waiting for a person</p>
          <p className="px-1 text-xs muted">The agents propose; a person approves every repair.</p>
          {count === 0 ? <p className="px-1 py-2 text-sm muted">Nothing is waiting right now.</p> : (
            <ul className="mt-1">
              {tasks.map((t) => {
                const l = pool.data?.loops.find((x) => x.loop_id === t.loop_id);
                return (
                  <li key={t.task_id}>
                    <Link href={`/swaps/${t.loop_id}`} onClick={() => setOpen(false)} className="block rounded-lg px-2 py-2 text-sm hover:bg-[var(--surface-soft)]">
                      <span className="font-semibold" style={{ color: "var(--ink-strong)" }}>Approve a {organOf(l).label.toLowerCase()} repair · {t.loop_id}</span>
                      <span className="block muted">{l ? loopRoute(l) : ""} · {fmtTime(t.at)}</span>
                    </Link>
                  </li>
                );
              })}
              {esc.map((e) => (
                <li key={e.task_id}>
                  <Link href={`/swaps/${e.loop_id}`} onClick={() => setOpen(false)} className="block rounded-lg px-2 py-2 text-sm hover:bg-[var(--surface-soft)]">
                    <span className="font-semibold" style={{ color: "var(--ink-strong)" }}>Papers overdue · {e.loop_id}</span>
                    <span className="block muted">{e.city} {e.pair_id}: {e.missing.map((m) => m.replace(/_/g, " ")).join(", ")} · {e.days_left} days left</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Popover>
      )}
    </div>
  );
}

function Search() {
  const pool = useResource("pool", (a) => a.pool());
  const { includes } = useProgram();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (s.length < 2 || !pool.data) return [];
    const out: { href: string; label: string; sub: string }[] = [];
    for (const l of pool.data.loops.filter((x) => includes(x.organ))) {
      if (l.loop_id.toLowerCase().includes(s) || loopRoute(l).toLowerCase().includes(s)) out.push({ href: `/swaps/${l.loop_id}`, label: l.loop_id, sub: loopRoute(l) });
      for (const p of l.pairs) if (p.pair_id.toLowerCase().includes(s)) out.push({ href: `/pool?pair=${p.pair_id}`, label: p.pair_id, sub: `${p.city} · ${l.loop_id}` });
    }
    return out.filter((r, i, a) => a.findIndex((x) => x.href === r.href) === i).slice(0, 8);
  }, [q, pool.data, includes]);
  return (
    <div className="relative hidden xl:block">
      <label className="sr-only" htmlFor="ws-search">Find a swap or family</label>
      <div className="flex items-center gap-2 rounded-full border px-3 py-1.5 w-52" style={{ borderColor: "var(--line)", background: "var(--surface)" }}>
        <Icon name="search" size={15} className="muted shrink-0" />
        <input id="ws-search" className="w-full bg-transparent outline-none text-sm" placeholder="Find a swap or family" value={q}
               onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)}
               onKeyDown={(e) => { if (e.key === "Enter" && results[0]) { router.push(results[0].href); setOpen(false); setQ(""); } }} />
      </div>
      {open && q.trim().length >= 2 && (
        <Popover onClose={() => setOpen(false)}>
          {results.length === 0 ? <p className="px-1 text-sm muted">Nothing matches &ldquo;{q}&rdquo;.</p> : (
            <ul>
              {results.map((r) => (
                <li key={r.href}>
                  <Link href={r.href} onClick={() => { setOpen(false); setQ(""); }} className="block rounded-lg px-2 py-1.5 text-sm hover:bg-[var(--surface-soft)]">
                    <span className="font-semibold" style={{ color: "var(--ink-strong)" }}>{r.label}</span> <span className="muted">{r.sub}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Popover>
      )}
    </div>
  );
}

function More({ path }: { path: string }) {
  const [open, setOpen] = useState(false);
  const on = NAV_MORE.some((n) => isActive(path, n.href));
  return (
    <div className="relative">
      <button className="nav-link inline-flex items-center gap-1" data-active={on || undefined} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        More <Icon name="down" size={14} />
      </button>
      {open && (
        <Popover onClose={() => setOpen(false)} align="left" width="w-72">
          <ul>
            {NAV_MORE.map((n) => (
              <li key={n.href}>
                <Link href={n.href} onClick={() => setOpen(false)} className="block rounded-lg px-2 py-2 text-sm hover:bg-[var(--surface-soft)]">
                  <span className="font-semibold" style={{ color: "var(--ink-strong)" }}>{n.label}</span>
                  <span className="block muted text-xs">{n.sub}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Popover>
      )}
    </div>
  );
}

function ShellInner({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const [menu, setMenu] = useState(false);
  useEffect(() => setMenu(false), [path]);
  useEffect(() => {
    if (!menu) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenu(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [menu]);
  const c = crumbs(path);
  const { program } = useProgram();
  const programPage = PROGRAM_PAGES.some((p) => isActive(path, p));
  const content = useRef<HTMLDivElement>(null);
  // Switching programs is a change of context, so the content settles in again (unless motion is reduced).
  useGSAP(() => {
    gsap.matchMedia().add("(prefers-reduced-motion: no-preference)", () => {
      gsap.fromTo(content.current, { autoAlpha: 0.35, y: 6 }, { autoAlpha: 1, y: 0, duration: 0.35, ease: "power2.out" });
    });
  }, { dependencies: [program], scope: content });

  return (
    <div className="min-h-screen flex flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[70] btn">Skip to content</a>
      <header className="sticky top-0 z-40 border-b" style={{ background: "rgba(247,246,240,0.92)", backdropFilter: "blur(10px)", borderColor: "var(--line)" }}>
        <div className="mx-auto flex h-16 max-w-[1400px] items-center gap-4 px-4 sm:px-6 lg:px-10">
          <Link href="/" aria-label="KindRed home" className="shrink-0"><Logo size={30} /></Link>
          <nav aria-label="Workspace" className="hidden lg:flex items-center gap-1 ml-4">
            {NAV_MAIN.map((n) => (
              <Link key={n.href} href={n.href} className="nav-link" data-active={isActive(path, n.href) || undefined} aria-current={isActive(path, n.href) ? "page" : undefined}>{n.label}</Link>
            ))}
            <More path={path} />
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <OfflineChip />
            <Search />
            <NeedsAPerson />
            <button className="lg:hidden grid h-9 w-9 place-items-center rounded-lg border" style={{ borderColor: "var(--line)" }} onClick={() => setMenu(true)} aria-label="Open navigation" aria-expanded={menu}>
              <Icon name="menu" size={18} />
            </button>
          </div>
        </div>
      </header>

      {menu && (
        <div className="lg:hidden fixed inset-0 z-[60]">
          <div className="absolute inset-0" style={{ background: "rgba(16,42,36,0.45)" }} onClick={() => setMenu(false)} />
          <aside className="absolute right-0 top-0 h-full w-72 max-w-[85vw] flex flex-col overflow-y-auto" style={{ background: "var(--surface)" }} role="dialog" aria-modal="true" aria-label="Navigation">
            <div className="flex items-center justify-between px-5 pt-5 pb-4">
              <Logo size={26} />
              <button className="rounded-md p-1.5" onClick={() => setMenu(false)} aria-label="Close navigation"><Icon name="close" size={20} /></button>
            </div>
            <nav className="px-3 pb-6">
              {[...NAV_MAIN, ...NAV_MORE].map((n) => (
                <Link key={n.href} href={n.href} className="block rounded-lg px-3 py-2.5 text-[0.95rem]"
                      style={{ background: isActive(path, n.href) ? "var(--sage-pale)" : undefined, color: "var(--ink-strong)", fontWeight: isActive(path, n.href) ? 600 : 500 }}>{n.label}</Link>
              ))}
            </nav>
          </aside>
        </div>
      )}

      <main id="main" className="flex-1 mx-auto w-full max-w-[1400px] px-4 sm:px-6 lg:px-10 pt-5 pb-16">
        {(c.length > 0 || programPage) && (
          <div className="mb-4 flex flex-wrap items-center gap-3">
            {c.length > 0 && (
              <nav aria-label="Breadcrumb" className="min-w-0 flex-1">
                <ol className="flex items-center gap-1.5 text-sm truncate">
                  {c.map((x, i) => (
                    <li key={i} className="flex items-center gap-1.5 min-w-0">
                      {i > 0 && <Icon name="chevron" size={14} className="muted shrink-0" />}
                      {x.href ? <Link href={x.href} className="muted hover:underline truncate">{x.label}</Link>
                        : <span className="font-semibold truncate" style={{ color: "var(--ink-strong)" }} aria-current="page">{x.label}</span>}
                    </li>
                  ))}
                </ol>
              </nav>
            )}
            {programPage && <ProgramToggle className="ml-auto" />}
          </div>
        )}
        <div ref={content}>{children}</div>
      </main>
      <KinGuide />
    </div>
  );
}

export default function Shell({ children }: { children: React.ReactNode }) {
  return <DataProvider><ProgramProvider><ShellInner>{children}</ShellInner></ProgramProvider></DataProvider>;
}

"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "./icons";
import { Logo } from "@/components/Logo";
import DemoGuide from "./DemoGuide";
import { DataProvider, useData, useResource } from "@/lib/data/source";
import { fmtTime, loopRoute } from "@/lib/data/derive";
import { PROGRAM_LABEL, ProgramProvider, useProgram, type ProgramKey } from "@/lib/program";
import { ORGANS, ORGAN_NAMES, organOf } from "@/lib/organs";
import type { Viewer } from "@/lib/data/types";
import { gsap, useGSAP } from "@/components/landing/gsap";

export const NAV_GROUPS = [
  { title: "Run the exchange", items: [
    { href: "/pool", label: "Live pool", icon: "pool", sub: "Map of every planned donation" },
    { href: "/ask", label: "Ask KindRed", icon: "search", sub: "Questions answered from the graph" },
    { href: "/swaps", label: "Swaps", icon: "swaps", sub: "Tests, failures, repairs" },
    { href: "/committee", label: "Committee review", icon: "committee", sub: "Program checklists and papers" },
    { href: "/integrity", label: "Integrity", icon: "integrity", sub: "Data and workflow checks" },
    { href: "/case/P-0154", label: "Family view", icon: "family", sub: "What a family sees" },
  ] },
  { title: "Understand it", items: [
    { href: "/lab", label: "Simulation lab", icon: "replay", sub: "Each program's scenario, step by step" },
    { href: "/impact", label: "Impact", icon: "lab", sub: "A simulated year, measured" },
    { href: "/graph", label: "How it works", icon: "database", sub: "FalkorDB graphs, queries, agents" },
    { href: "/audit", label: "Audit trail", icon: "audit", sub: "Every action and decision" },
  ] },
];
export const NAV = NAV_GROUPS.flatMap((g) => g.items);

function crumbs(path: string): { label: string; href?: string }[] {
  const seg = path.split("/").filter(Boolean);
  if (seg[0] === "case") return [{ label: `Family view · ${seg[1]}` }];
  const base = NAV.find((n) => path === n.href || path.startsWith(n.href + "/"));
  if (!base) return [];
  return seg.length > 1 ? [{ label: base.label, href: base.href }, { label: decodeURIComponent(seg[1]) }] : [{ label: base.label }];
}
const isActive = (path: string, href: string) => path === href || path.startsWith(href + "/") || (href.startsWith("/case/") && path.startsWith("/case/"));

/** One platform, two programs. The choice changes every screen's data, columns, words and scenario. */
function ProgramSwitcher() {
  const { program, setProgram } = useProgram();
  const opts: { key: ProgramKey; label: string; sub: string }[] = [
    ...ORGAN_NAMES.map((o) => ({ key: o as ProgramKey, label: ORGANS[o].label, sub: "Paired donation" })),
    { key: "all", label: "All programs", sub: "Operational overview" },
  ];
  return (
    <div className="px-3 pb-4" role="radiogroup" aria-label="Exchange program">
      <p className="px-3 pb-1.5 text-[0.66rem] font-semibold uppercase tracking-[0.14em]" style={{ color: "#6F8F80" }}>Exchange program</p>
      <div className="grid grid-cols-2 gap-1.5">
        {opts.map((o) => {
          const on = program === o.key;
          const tone = o.key === "all" ? "#A6D8B5" : ORGANS[o.key].lineFocus;
          return (
            <button key={o.key} role="radio" aria-checked={on} onClick={() => setProgram(o.key)}
                    className={`text-left rounded-lg border px-3 py-2 transition-colors hover:bg-white/5 ${o.key === "all" ? "col-span-2" : ""}`}
                    style={{ borderColor: on ? tone : "rgba(166,216,181,0.18)", background: on ? "rgba(166,216,181,0.12)" : "transparent" }}>
              <span className="flex items-center gap-1.5 text-[0.86rem] font-semibold" style={{ color: on ? "#FFFFFF" : "#D5E3DA" }}>
                {o.key !== "all" && <span className="h-2 w-2 rounded-full" style={{ background: ORGANS[o.key].line }} aria-hidden="true" />}{o.label}
              </span>
              <span className="block text-[0.68rem] leading-snug" style={{ color: "#7E9A8B" }}>{o.sub}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function NavList({ path, onNavigate }: { path: string; onNavigate?: () => void }) {
  const { view } = useProgram();
  return (
    <nav aria-label="Workspace" className="flex-1 px-3 py-2 overflow-y-auto">
      {NAV_GROUPS.map((g) => (
        <div key={g.title} className="mb-5">
          <p className="px-3 pb-1.5 text-[0.66rem] font-semibold uppercase tracking-[0.14em]" style={{ color: "#6F8F80" }}>{g.title}</p>
          <ul className="space-y-0.5">
            {g.items.map((item) => {
              // The family view opens the current program's story family.
              const n = item.href.startsWith("/case/") ? { ...item, href: `/case/${(view ?? ORGANS.kidney).familyPair}` } : item;
              const on = isActive(path, n.href);
              return (
                <li key={n.href}>
                  <Link href={n.href} onClick={onNavigate} aria-current={on ? "page" : undefined}
                        className="relative flex items-start gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-white/5"
                        style={{ background: on ? "rgba(166,216,181,0.14)" : undefined }}>
                    {on && <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full" style={{ background: "var(--mint)" }} aria-hidden="true" />}
                    <span className="mt-0.5" style={{ color: on ? "#FFFFFF" : "#B9CBBF" }}><Icon name={n.icon} size={18} /></span>
                    <span className="min-w-0">
                      <span className="block text-[0.9rem] leading-tight" style={{ color: on ? "#FFFFFF" : "#D5E3DA", fontWeight: on ? 600 : 500 }}>{n.label}</span>
                      <span className="block text-[0.72rem] leading-snug mt-0.5" style={{ color: "#7E9A8B" }}>{n.sub}</span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
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

function Notifications() {
  const pool = useResource("pool", (a) => a.pool(), 5000);
  const { includes } = useProgram();
  const [open, setOpen] = useState(false);
  const organOfLoop = (id: string) => pool.data?.loops.find((l) => l.loop_id === id)?.organ;
  const tasks = (pool.data?.open_tasks ?? []).filter((t) => includes(organOfLoop(t.loop_id)));
  const esc = (pool.data?.escalations ?? []).filter((e) => includes(organOfLoop(e.loop_id)));
  const count = tasks.length + esc.length;
  return (
    <div className="relative">
      <button className="relative grid h-9 w-9 place-items-center rounded-full hover:bg-[var(--surface-soft)]" onClick={() => setOpen((o) => !o)} aria-label={`Notifications, ${count} waiting`} aria-expanded={open}>
        <Icon name="bell" size={19} />
        {count > 0 && <span className="absolute top-1 right-1 h-2.5 w-2.5 rounded-full ring-2 ring-[var(--bg)]" style={{ background: "var(--bad-mark)" }} />}
      </button>
      {open && (
        <Popover onClose={() => setOpen(false)}>
          <p className="px-1 text-sm font-semibold" style={{ color: "var(--ink-strong)" }}>Waiting for you</p>
          {count === 0 ? <p className="px-1 py-2 text-sm muted">You&rsquo;re all caught up.</p> : (
            <ul className="mt-1">
              {tasks.map((t) => {
                const l = pool.data?.loops.find((x) => x.loop_id === t.loop_id);
                return (
                  <li key={t.task_id}>
                    <Link href={`/swaps/${t.loop_id}`} onClick={() => setOpen(false)} className="block rounded-lg px-2 py-2 text-sm hover:bg-[var(--surface-soft)]">
                      <span className="font-semibold" style={{ color: "var(--ink-strong)" }}>{organOf(l).label} repair to review · {t.loop_id}</span>
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
    <div className="relative hidden md:block">
      <label className="sr-only" htmlFor="ws-search">Search exchanges and pairs</label>
      <div className="flex items-center gap-2 rounded-full border px-3.5 py-2 w-64 xl:w-80" style={{ borderColor: "var(--line)", background: "var(--surface)" }}>
        <Icon name="search" size={16} className="muted shrink-0" />
        <input id="ws-search" className="w-full bg-transparent outline-none text-sm" placeholder="Search exchanges or pairs" value={q}
               onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)}
               onKeyDown={(e) => { if (e.key === "Enter" && results[0]) { router.push(results[0].href); setOpen(false); setQ(""); } }} />
        <kbd className="hidden xl:inline text-[0.68rem] muted border rounded px-1.5" style={{ borderColor: "var(--line)" }}>↵</kbd>
      </div>
      {open && q.trim().length >= 2 && (
        <Popover onClose={() => setOpen(false)} align="left">
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

function Avatar() {
  const me = useResource<Viewer>("me", (a) => a.me());
  const v = me.data;
  const name = v?.name ?? "Meera Iyer";
  const role = v?.role_label ?? "Platform admin";
  const initials = name.split(" ").map((w) => w[0]).join("").slice(0, 2);
  return (
    <span className="grid h-9 w-9 place-items-center rounded-full text-xs font-bold" style={{ background: "var(--forest)", color: "var(--mint)" }}
          title={`${name} · ${role} · demo identity (no authentication in this prototype)`} aria-label={`Demo identity ${name}, ${role}. No authentication in this prototype.`}>{initials}</span>
  );
}

/** The program the breadcrumb starts from, so every screen says which program it shows. */
function ProgramCrumb() {
  const { program, view } = useProgram();
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold shrink-0"
          style={{ borderColor: view ? view.tone : "var(--line-strong)", color: view ? view.tone : "var(--ink)" }}>
      {view && <span className="h-1.5 w-1.5 rounded-full" style={{ background: view.tone }} aria-hidden="true" />}
      {view ? view.title : PROGRAM_LABEL[program]}
    </span>
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
  const content = useRef<HTMLDivElement>(null);
  // Switching programs is a change of context, so the content settles in again (unless motion is reduced).
  useGSAP(() => {
    gsap.matchMedia().add("(prefers-reduced-motion: no-preference)", () => {
      gsap.fromTo(content.current, { autoAlpha: 0.35, y: 6 }, { autoAlpha: 1, y: 0, duration: 0.35, ease: "power2.out" });
    });
  }, { dependencies: [program], scope: content });

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[248px_1fr]">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[70] btn">Skip to content</a>
      <aside className="hidden lg:flex lg:flex-col sticky top-0 h-screen" style={{ background: "var(--forest-deep)" }}>
        <Link href="/" className="px-6 pt-6 pb-5" aria-label="KindRed home"><Logo tone="dark" size={28} /></Link>
        <ProgramSwitcher />
        <NavList path={path} />
      </aside>

      {menu && (
        <div className="lg:hidden fixed inset-0 z-[60]">
          <div className="absolute inset-0" style={{ background: "rgba(16,42,36,0.45)" }} onClick={() => setMenu(false)} />
          <aside className="absolute left-0 top-0 h-full w-72 max-w-[85vw] flex flex-col" style={{ background: "var(--forest-deep)" }} role="dialog" aria-modal="true" aria-label="Navigation">
            <div className="flex items-center justify-between px-6 pt-6 pb-6">
              <Logo tone="dark" size={26} />
              <button className="rounded-md p-1.5 text-white" onClick={() => setMenu(false)} aria-label="Close navigation"><Icon name="close" size={20} /></button>
            </div>
            <ProgramSwitcher />
            <NavList path={path} onNavigate={() => setMenu(false)} />
          </aside>
        </div>
      )}

      <div className="min-w-0 flex flex-col">
        <header className="sticky top-0 z-40" style={{ background: "rgba(247,246,240,0.9)", backdropFilter: "blur(10px)" }}>
          <div className="flex items-center gap-3 px-4 sm:px-6 lg:px-10 h-16">
            <button className="lg:hidden grid h-9 w-9 place-items-center rounded-lg border" style={{ borderColor: "var(--line)" }} onClick={() => setMenu(true)} aria-label="Open navigation" aria-expanded={menu}>
              <Icon name="menu" size={18} />
            </button>
            <nav aria-label="Breadcrumb" className="min-w-0 flex-1">
              <ol className="flex items-center gap-1.5 text-sm truncate">
                <li className="flex items-center"><ProgramCrumb /></li>
                {c.map((x, i) => (
                  <li key={i} className="flex items-center gap-1.5 min-w-0">
                    <Icon name="chevron" size={14} className="muted shrink-0" />
                    {x.href ? <Link href={x.href} className="muted hover:underline truncate">{x.label}</Link>
                      : <span className="font-semibold truncate" style={{ color: "var(--ink-strong)" }} aria-current="page">{x.label}</span>}
                  </li>
                ))}
              </ol>
            </nav>
            <OfflineChip />
            <Search />
            <Notifications />
            <Avatar />
          </div>
        </header>
        <main id="main" className="flex-1 px-4 sm:px-6 lg:px-10 pt-4 pb-12 max-w-[1480px] w-full"><div ref={content}><DemoGuide />{children}</div></main>
      </div>
    </div>
  );
}

export default function Shell({ children }: { children: React.ReactNode }) {
  return <DataProvider><ProgramProvider><ShellInner>{children}</ShellInner></ProgramProvider></DataProvider>;
}

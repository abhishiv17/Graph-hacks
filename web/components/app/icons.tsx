// One icon family for the workspace: 24px grid, 1.6 stroke, round joins.
const P: Record<string, React.ReactNode> = {
  overview: <><rect x="3.5" y="3.5" width="7" height="8" rx="1.5" /><rect x="13.5" y="3.5" width="7" height="5" rx="1.5" /><rect x="13.5" y="11.5" width="7" height="9" rx="1.5" /><rect x="3.5" y="14.5" width="7" height="6" rx="1.5" /></>,
  pool: <><circle cx="6" cy="7" r="2.2" /><circle cx="18" cy="6" r="2.2" /><circle cx="12" cy="17.5" r="2.2" /><path d="M8 7.6 15.9 6.4M7.2 8.9l3.6 6.7M16.9 7.9l-3.8 7.7" /></>,
  swaps: <><path d="M5 9.5a7 7 0 0 1 12.2-3.4L19 8" /><path d="M19 4v4h-4" /><path d="M19 14.5a7 7 0 0 1-12.2 3.4L5 16" /><path d="M5 20v-4h4" /></>,
  committee: <><path d="M3.5 7.5v10A1.5 1.5 0 0 0 5 19h14a1.5 1.5 0 0 0 1.5-1.5V9A1.5 1.5 0 0 0 19 7.5h-7L10 5H5a1.5 1.5 0 0 0-1.5 1.5Z" /><path d="m9 13.5 2 2 4-4" /></>,
  surgery: <><rect x="3.5" y="5" width="17" height="15" rx="2" /><path d="M3.5 9.5h17M8 3v4M16 3v4M8 13.5h3M8 16.5h6" /></>,
  integrity: <><path d="M12 3.5 5 6v5.5c0 4.3 3 7.6 7 9 4-1.4 7-4.7 7-9V6Z" /><path d="m9 12 2.2 2.2L15.5 10" /></>,
  medication: <><rect x="3.2" y="9" width="17.6" height="6" rx="3" transform="rotate(-40 12 12)" /><path d="m9.6 9.6 4.8 4.8" /></>,
  lab: <><path d="M9.5 3.5h5M10.5 3.5v5.2L5.4 17.4A2 2 0 0 0 7.2 20.5h9.6a2 2 0 0 0 1.8-3.1l-5.1-8.7V3.5" /><path d="M7.6 14.5h8.8" /></>,
  family: <><circle cx="8.5" cy="8" r="2.8" /><circle cx="16.5" cy="9" r="2.3" /><path d="M3.5 19c0-3 2.2-5 5-5s5 2 5 5M14 14.4c.8-.3 1.6-.4 2.5-.4 2.4 0 4 1.7 4 4.5" /></>,
  audit: <><path d="M8 4.5h11.5M8 10h11.5M8 15.5h6" /><circle cx="4.5" cy="4.5" r=".9" /><circle cx="4.5" cy="10" r=".9" /><circle cx="17.5" cy="18" r="3.2" /><path d="M17.5 16.7V18l.9.7" /></>,
  code: <><path d="m8.5 7.5-4.5 4.5 4.5 4.5M15.5 7.5l4.5 4.5-4.5 4.5M13.5 5l-3 14" /></>,
  search: <><circle cx="10.5" cy="10.5" r="6" /><path d="m15 15 5 5" /></>,
  bell: <><path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15Z" /><path d="M10 20.5a2 2 0 0 0 4 0" /></>,
  menu: <><path d="M4 7h16M4 12h16M4 17h16" /></>,
  close: <><path d="m6 6 12 12M18 6 6 18" /></>,
  chevron: <><path d="m9 6 6 6-6 6" /></>,
  down: <><path d="m6 9 6 6 6-6" /></>,
  user: <><circle cx="12" cy="8.5" r="3.5" /><path d="M5 20c0-3.6 3.1-6 7-6s7 2.4 7 6" /></>,
  check: <><path d="m5 12.5 4.5 4.5L19 7.5" /></>,
  x: <><path d="m7 7 10 10M17 7 7 17" /></>,
  alert: <><path d="M12 4 2.8 19.5h18.4Z" /><path d="M12 10v4.2M12 17v.1" /></>,
  info: <><circle cx="12" cy="12" r="8.5" /><path d="M12 11v5M12 8v.1" /></>,
  play: <><path d="M7 5v14l12-7Z" /></>,
  reset: <><path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3L4.5 9" /><path d="M4.5 4.5V9H9" /></>,
  replay: <><path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3L19.5 9" /><path d="M19.5 4.5V9H15" /><path d="m10 9.5 4 2.5-4 2.5Z" /></>,
  database: <><ellipse cx="12" cy="6" rx="7" ry="2.5" /><path d="M5 6v12c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5V6M5 12c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5" /></>,
  external: <><path d="M14 4.5h5.5V10M19.5 4.5 11 13M18 14v4.5A1.5 1.5 0 0 1 16.5 20h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10" /></>,
  hospital: <><path d="M4 20.5V8l8-4.5L20 8v12.5Z" /><path d="M12 9v5M9.5 11.5h5M9.5 20.5V17h5v3.5" /></>,
};

export function Icon({ name, size = 18, className, strokeWidth = 1.6 }: { name: keyof typeof P | string; size?: number; className?: string; strokeWidth?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth}
         strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      {P[name]}
    </svg>
  );
}

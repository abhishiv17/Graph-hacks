"""Write docs/queries.md from backend/queries/*.cypher, so the list of queries can't drift from the code.

Each entry is the file's own header comment, whether it runs read-only (the same rule the app uses: no CREATE, MERGE,
SET, DELETE or REMOVE outside comments means GRAPH.RO_QUERY), and the full Cypher. With --live URL, the run counts and
p50/p95 timings measured on that running server are added.

    python scripts/build-queries-doc.py [--live https://<api-host>]
"""
import argparse
import json
import re
import urllib.request
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
QUERIES = ROOT / "backend" / "queries"
OUT = ROOT / "docs" / "queries.md"
WRITES = re.compile(r"\b(CREATE|MERGE|SET|DELETE|REMOVE)\b", re.IGNORECASE)
ALGORITHMS = [
    ("Q07_components", "`algo.WCC`", "Splits the pool into independent parts before matching"),
    ("Q19_bridge_pairs", "`algo.betweenness`", "Bridge families whose withdrawal would break the most swaps"),
    ("Q59_match_ease", "`algo.pageRank`", "How easy each waiting family is to place, so the hardest can go first"),
    ("Q34_connection_path", "`shortestPath` over `*1..6`", "The shortest chain of donations between two families"),
    ("Q33_reachable_within", "variable-length `*1..3`", "Who a family's donor can reach in 1 to 3 donations"),
    ("Q11_local_repair_candidates", "bounded 2-hop search", "Repair candidates only near the families a failure released"),
]


def parse(path: Path) -> dict:
    text = path.read_text(encoding="utf-8").strip()
    lines = text.splitlines()
    head = []
    for line in lines:
        if not line.strip().startswith("//"):
            break
        head.append(line.strip().lstrip("/").strip())
    body = "\n".join(l for l in lines if not l.strip().startswith("//"))
    return {"name": path.stem, "about": " ".join(head), "read_only": not WRITES.search(body), "text": text}


def live_timings(url: str) -> dict:
    with urllib.request.urlopen(f"{url.rstrip('/')}/api/graph/overview", timeout=30) as r:
        return {q["name"]: q for q in json.load(r)["queries"]}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--live", help="a running KindRed API, for measured timings")
    args = ap.parse_args()
    qs = [parse(p) for p in sorted(QUERIES.glob("*.cypher"))]
    runs = live_timings(args.live) if args.live else {}
    ro = sum(q["read_only"] for q in qs)
    out = [
        "# KindRed's Cypher queries",
        "",
        f"Every query KindRed runs against FalkorDB is a named, parameterised file in `backend/queries/`: {len(qs)} in all, "
        f"{ro} read-only and {len(qs) - ro} that write. No query is built from strings, and the language models never write "
        "Cypher: they choose a tool, and each tool runs one of these files. A query with no `CREATE`, `MERGE`, `SET`, "
        "`DELETE` or `REMOVE` runs through `GRAPH.RO_QUERY`, so FalkorDB itself refuses a write from it.",
        "",
        "This page is generated from the files by `scripts/build-queries-doc.py`; the How it works page (`/graph`) shows the "
        "same list with live timings.",
        "",
        "## Graph algorithms and multi-hop traversals",
        "",
        "| Query | Uses | For |",
        "|---|---|---|",
        *[f"| [`{n}`](#{n.lower()}) | {u} | {f} |" for n, u, f in ALGORITHMS],
        "",
        "## All queries",
        "",
    ]
    if runs:
        out += [f"Runs and timings: measured on the live server on {date.today():%d %B %Y}, after a demo reset and a run "
                "through the demo story.", ""]
        out += ["| Query | What it does | Read-only | Runs | p50 | p95 |", "|---|---|---|---|---|---|"]
    else:
        out += ["| Query | What it does | Read-only |", "|---|---|---|"]
    for q in qs:
        about = q["about"].replace("|", "\\|")
        row = f"| [`{q['name']}`](#{q['name'].lower()}) | {about} | {'yes' if q['read_only'] else 'writes'} |"
        if runs:
            r = runs.get(q["name"], {})
            fmt = lambda v: f"{v} ms" if v is not None else "–"
            row += f" {r.get('runs') or '–'} | {fmt(r.get('p50_ms'))} | {fmt(r.get('p95_ms'))} |"
        out.append(row)
    out += ["", "## The queries", ""]
    for q in qs:
        out += [f"### {q['name']}", "", f"{'Read-only (`GRAPH.RO_QUERY`).' if q['read_only'] else 'Writes.'} "
                f"File: [`backend/queries/{q['name']}.cypher`](../backend/queries/{q['name']}.cypher)", "",
                "```cypher", q["text"], "```", ""]
    OUT.write_text("\n".join(out), encoding="utf-8", newline="\n")
    print(f"wrote {OUT.relative_to(ROOT)}: {len(qs)} queries, {ro} read-only{', with live timings' if runs else ''}")


if __name__ == "__main__":
    main()

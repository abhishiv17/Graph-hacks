"""FalkorDB access. Every query is a named .cypher file so the UI can show exactly what ran."""
import contextvars
import re
import threading
import time
from collections import deque

from falkordb import FalkorDB

from swapnet import config

_db = None
_lock = threading.Lock()
_ran: contextvars.ContextVar[list | None] = contextvars.ContextVar("ran", default=None)
# Every named query that ran in this process, newest last, for the "How it works" screen.
LOG: deque = deque(maxlen=500)


def db() -> FalkorDB:
    global _db
    if _db is None:
        _db = FalkorDB(host=config.FALKORDB_HOST, port=config.FALKORDB_PORT)
    return _db


def query_text(name: str) -> str:
    return (config.QUERIES / f"{name}.cypher").read_text(encoding="utf-8")


_WRITES = re.compile(r"\b(CREATE|MERGE|SET|DELETE|REMOVE)\b", re.IGNORECASE)


def is_read_only(name: str) -> bool:
    """A named query with no write clause. These run through GRAPH.RO_QUERY, so FalkorDB itself refuses
    any write from them, and the Ask agent can only reach queries that pass this check."""
    body = "\n".join(l for l in query_text(name).splitlines() if not l.strip().startswith("//"))
    return not _WRITES.search(body)


def all_queries() -> dict[str, str]:
    return {p.stem: p.read_text(encoding="utf-8") for p in sorted(config.QUERIES.glob("Q*.cypher"))}


def run(name: str, params: dict | None = None, graph: str = config.EXCHANGE) -> list[dict]:
    """Run a named query and return rows as dicts. Records the query and its latency."""
    text = query_text(name)
    ro = is_read_only(name)
    g = db().select_graph(graph)
    t0 = time.perf_counter()
    res = (g.ro_query if ro else g.query)(text, params or {})
    ms = (time.perf_counter() - t0) * 1000
    entry = {"query": name, "graph": graph, "ms": round(ms, 2), "read_only": ro}
    LOG.append({**entry, "at": int(time.time() * 1000), "rows": len(res.result_set)})
    ran = _ran.get()
    if ran is not None:
        ran.append(entry)
    header = [h[1] if isinstance(h, (list, tuple)) else h for h in res.header]
    return [dict(zip(header, row)) for row in res.result_set]


def raw(cypher: str, params: dict | None = None, graph: str = config.EXCHANGE) -> list[dict]:
    """Small inline statements (setup, events). Analysis queries belong in named files."""
    res = db().select_graph(graph).query(cypher, params or {})
    header = [h[1] if isinstance(h, (list, tuple)) else h for h in res.header]
    return [dict(zip(header, row)) for row in res.result_set]


class track:
    """Collect which named queries ran inside a block: `with track() as q: ...; q.ran`."""

    def __enter__(self):
        self.ran: list[dict] = []
        self._token = _ran.set(self.ran)
        return self

    def __exit__(self, *exc):
        _ran.reset(self._token)


def setup_schema() -> None:
    db().config_set("RESULTSET_SIZE", -1)  # default caps results at 10,000 rows, which silently drops loops
    for stmt in query_text("Q00_schema").split(";"):
        lines = [l for l in stmt.strip().splitlines() if not l.strip().startswith("//")]
        s = "\n".join(lines).strip()
        if s:
            try:
                raw(s)
            except Exception as e:  # index already exists
                if "already" not in str(e).lower():
                    raise


def reset_all() -> None:
    for g in db().list_graphs():
        if g == config.EXCHANGE or g.startswith("hosp_"):
            db().select_graph(g).delete()


_seq_lock = threading.Lock()
_seq = 0


def event(agent: str, text: str, kind: str = "info") -> None:
    """Append to the agent feed. Events live in the graph so any agent can read them."""
    global _seq
    with _seq_lock:
        if _seq == 0:
            rows = raw("MATCH (e:Event) RETURN coalesce(max(e.seq), 0) AS s")
            _seq = rows[0]["s"] if rows else 0
        _seq += 1
        seq = _seq
    raw("CREATE (:Event {seq: $seq, at: timestamp(), agent: $agent, text: $text, kind: $kind})",
        {"seq": seq, "agent": agent, "text": text, "kind": kind})


def reset_seq() -> None:
    global _seq
    _seq = 0

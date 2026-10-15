"""Settings and parameter tables. Everything tunable lives in data/ as YAML."""
import os
from functools import lru_cache
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[2]
DATA = Path(os.getenv("SWAPNET_DATA", ROOT / "data"))
QUERIES = Path(__file__).resolve().parents[1] / "queries"

FALKORDB_HOST = os.getenv("FALKORDB_HOST", "localhost")
FALKORDB_PORT = int(os.getenv("FALKORDB_PORT", "6379"))
EXCHANGE = "exchange"


def hospital_graph(code: str) -> str:
    return f"hosp_{code.lower()}"


@lru_cache
def params() -> dict:
    return yaml.safe_load((DATA / "params" / "india_kidney.yaml").read_text(encoding="utf-8"))


@lru_cache
def hospitals() -> dict:
    return yaml.safe_load((DATA / "params" / "hospitals.yaml").read_text(encoding="utf-8"))


@lru_cache
def policies() -> dict:
    return yaml.safe_load((DATA / "policies" / "intake.yaml").read_text(encoding="utf-8"))


def edge_params() -> dict:
    p = params()
    f = p["failure"]
    return {
        "mfi": p["mfi_threshold"],
        "xm_low": f["xm_positive_low_cpra"],
        "xm_high": f["xm_positive_high_cpra"],
        "untyped_extra": f["untyped_dq_extra"],
        "refusal": f["offer_refusal"],
    }

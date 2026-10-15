"""Organ registry. The swap engine looks organs up here by the `organ` property on Pair and Loop nodes.
See organs/base.py for how to add one."""
from swapnet.organs.base import Organ
from swapnet.organs.kidney import Kidney
from swapnet.organs.liver import Liver

ORGANS: dict[str, Organ] = {o.name: o for o in (Kidney(), Liver())}
DEFAULT = "kidney"


def get(name: str | None) -> Organ:
    return ORGANS[name or DEFAULT]


def names() -> list[str]:
    return list(ORGANS)

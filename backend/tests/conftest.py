"""Shared test setup. The tests reset and rewrite the demo graph from this process, while the API server's background
watch may be sweeping the same FalkorDB from another; pause every watch for the run so the two never interleave."""
import pytest

from swapnet.agents import watch


@pytest.fixture(scope="session", autouse=True)
def _pause_watch():
    watch.pause(seconds=1800)
    yield
    watch.resume()

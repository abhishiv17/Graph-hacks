#!/usr/bin/env bash
# Run the simulation lab (writes data/generated/sim_results.json). Takes a few minutes.
set -e
cd "$(dirname "$0")/../backend"
python -m swapnet.sim.lab --runs "${RUNS:-20}"

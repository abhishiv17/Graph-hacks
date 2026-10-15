# Run the simulation lab (writes data/generated/sim_results.json). Takes a few minutes.
Set-Location (Join-Path $PSScriptRoot "..\backend")
$runs = if ($env:RUNS) { $env:RUNS } else { "20" }
python -m swapnet.sim.lab --runs $runs

# Windows dev start without Docker for the app: FalkorDB in Docker, backend and web locally.
# Run from the repo root in PowerShell:  .\scripts\dev.ps1
$root = Split-Path $PSScriptRoot -Parent
docker start falkordb 2>$null; if ($LASTEXITCODE -ne 0) { docker run -d --name falkordb -p 6379:6379 -p 3000:3000 falkordb/falkordb }
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$root\backend'; pip install -e .; uvicorn swapnet.api.main:app --port 8000"
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$root\web'; npm install; npm run dev"
Write-Host "Backend on http://localhost:8000, web on http://localhost:3001 (FalkorDB browser on http://localhost:3000)"

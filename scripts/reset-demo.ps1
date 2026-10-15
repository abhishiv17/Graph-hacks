# Reload the synthetic demo pool and scenario S-0031 (API must be running on port 8000).
$api = if ($env:API_URL) { $env:API_URL } else { "http://localhost:8000" }
Invoke-RestMethod -Method Post -Uri "$api/api/demo/reset"

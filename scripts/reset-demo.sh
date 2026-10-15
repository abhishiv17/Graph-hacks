#!/usr/bin/env bash
# Reload the synthetic demo pool and scenario S-0031 (API must be running on port 8000).
set -e
curl -s -X POST "${API_URL:-http://localhost:8000}/api/demo/reset"
echo

#!/bin/bash
# Pull the latest code, refresh secrets from SSM Parameter Store and rebuild what changed.
set -euxo pipefail
REGION=ap-south-1
cd /opt/kindred
git pull --ff-only
: > .env
for name in GROQ_API_KEY SARVAM_API_KEY; do
  value=$(aws ssm get-parameter --region "$REGION" --name "/kindred/$name" --with-decryption --query Parameter.Value --output text 2>/dev/null || true)
  [ -n "$value" ] && [ "$value" != "None" ] && echo "$name=$value" >> .env
done
chmod 600 .env
cd deploy/aws
docker compose up -d --build
docker image prune -f

#!/bin/bash
# First boot of the KindRed server (Amazon Linux 2023): Docker, the repo, secrets from SSM, then the app.
set -euxo pipefail
REGION=ap-south-1

dnf install -y docker git
systemctl enable --now docker
mkdir -p /usr/local/lib/docker/cli-plugins
curl -fsSL https://github.com/docker/compose/releases/download/v2.29.7/docker-compose-linux-x86_64 -o /usr/local/lib/docker/cli-plugins/docker-compose
curl -fsSL https://github.com/docker/buildx/releases/download/v0.19.3/buildx-v0.19.3.linux-amd64 -o /usr/local/lib/docker/cli-plugins/docker-buildx
chmod +x /usr/local/lib/docker/cli-plugins/*

# Swap, so building the web app fits in 2 GB of memory.
if [ ! -f /swapfile ]; then
  fallocate -l 4G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  echo '/swapfile swap swap defaults 0 0' >> /etc/fstab
fi

git clone https://github.com/abhishiv17/Graph-hacks.git /opt/kindred || git -C /opt/kindred pull
bash /opt/kindred/deploy/aws/update.sh

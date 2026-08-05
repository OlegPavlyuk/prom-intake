#!/usr/bin/env bash
# VM startup script: install Docker Engine + the Compose plugin on Debian 12.
# GCE runs this on every boot, so it is guarded to be idempotent - a no-op once
# Docker is present. The application itself (compose stack, Caddy) is shipped by
# the CD pipeline in T16/T17, not here; this only prepares the runtime.
set -euo pipefail

if command -v docker >/dev/null 2>&1; then
  exit 0
fi

export DEBIAN_FRONTEND=noninteractive

apt-get update
apt-get install -y ca-certificates curl gnupg

install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/debian/gpg |
  gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg

# shellcheck disable=SC1091
. /etc/os-release
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
https://download.docker.com/linux/debian ${VERSION_CODENAME} stable" \
  >/etc/apt/sources.list.d/docker.list

apt-get update
apt-get install -y \
  docker-ce docker-ce-cli containerd.io \
  docker-buildx-plugin docker-compose-plugin

systemctl enable --now docker

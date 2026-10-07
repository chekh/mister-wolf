#!/usr/bin/env bash
# Изолированный прогон smoke-проверки OpenCode v1/v2 в Docker.
# Хост не трогается: конфиги opencode хэшируются до/после и сверяются.
# Сетевой доступ нужен только на этапе сборки образа (npm install внутри).
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/../../.." && pwd)"
IMAGE=wolf-oc-compat:latest

# Хэшируем конфиг и auth (не storage: живая сессия opencode пишет туда сама).
hash_host() {
  {
    if [ -d "$HOME/.config/opencode" ]; then find "$HOME/.config/opencode" -type f -exec shasum {} + 2>/dev/null; fi
    if [ -f "$HOME/.local/share/opencode/auth.json" ]; then shasum "$HOME/.local/share/opencode/auth.json" 2>/dev/null; fi
  } | shasum | awk '{print $1}'
}

if ! docker image inspect "$IMAGE" >/dev/null 2>&1; then
  echo "building $IMAGE ..."
  docker build -t "$IMAGE" "$HERE"
fi

BEFORE="$(hash_host)"
docker run --rm -e HOME=/home/oc -v "$REPO:/src:ro" "$IMAGE" bash /src/tests/container/opencode-v2/smoke.sh
AFTER="$(hash_host)"

echo "host config hash before: $BEFORE"
echo "host config hash after:  $AFTER"
if [ "$BEFORE" != "$AFTER" ]; then
  echo "HOST CONFIG CHANGED — isolation broken"
  exit 1
fi
echo "HOST ISOLATION: OK"

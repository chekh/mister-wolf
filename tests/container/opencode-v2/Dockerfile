# Изолированный контейнер для проверки совместимости Wolf с OpenCode v1/v2.
# Хост не трогается: оба CLI ставятся в отдельные префиксы внутри образа,
# HOME задаётся при запуске (см. run.sh). Сетевой доступ нужен только на
# этапе сборки (npm install) — внутри контейнера.
FROM node:22-bookworm-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends git ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# v1: opencode-ai@1.18.35 (минимально поддерживаемый — 1.18.29, актуальный — 1.18.35)
RUN mkdir -p /opt/oc-v1 && cd /opt/oc-v1 \
    && npm init -y >/dev/null 2>&1 \
    && npm install --no-audit --no-fund opencode-ai@1.18.35

# v2: @opencode/cli@2.0.24
RUN mkdir -p /opt/oc-v2 && cd /opt/oc-v2 \
    && npm init -y >/dev/null 2>&1 \
    && npm install --no-audit --no-fund @opencode/cli@2.0.24

# Отдельный HOME для изоляции от хоста (переопределяется в run.sh).
ENV HOME=/home/oc
RUN mkdir -p /home/oc

WORKDIR /work

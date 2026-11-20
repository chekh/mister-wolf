#!/usr/bin/env bash
# Разовый прогон тестов в контейнере на удалённом Linux-сервере (схема
# «docker context по SSH»): build context уходит на демон сервера, сборка
# и тесты идут на его CPU, логи и код возврата возвращаются в терминал.
# На сервере не остаётся копии исходников — только кэш сборки демона.
#
# Один раз настроить:
#   docker context create mw-srv --docker "host=ssh://USER@HOST"
#   (на сервере: запущенный Docker, ваш пользователь в группе docker)
#
# Использование:
#   npm run test:remote                 # npm run check в контейнере на сервере
#   npm run test:remote -- npm run e2e  # e2e идёт 12+ минут: держите сессию
#                                       # в tmux или запускайте detached
#
# Переменные:
#   MW_DOCKER_CONTEXT    имя docker context (по умолчанию mw-srv)
#   MW_IMAGE             тег образа (по умолчанию mister-wolf:remote-test)
#   WOLF_TEST_MAX_FORKS  лимит воркеров vitest в контейнере; по умолчанию
#                        адаптивно, но с потолком 4 — на многоядерном сервере
#                        поднимите явно (например 8)
set -euo pipefail

CTX="${MW_DOCKER_CONTEXT:-mw-srv}"
IMAGE="${MW_IMAGE:-mister-wolf:remote-test}"

if ! docker context inspect "$CTX" >/dev/null 2>&1; then
  echo "Docker context '$CTX' не найден. Создайте его один раз:" >&2
  echo "  docker context create $CTX --docker \"host=ssh://USER@HOST\"" >&2
  echo "(на сервере должен быть запущен Docker; ваш пользователь — в группе docker)" >&2
  exit 2
fi

echo "==> docker build --target test (идёт на сервере, context=$CTX)"
docker --context "$CTX" build --target test -t "$IMAGE" .

CMD=("$@")
if [ "${#CMD[@]}" -eq 0 ]; then
  CMD=(npm run check)
fi

if [ -n "${WOLF_TEST_MAX_FORKS:-}" ]; then
  echo "==> docker run (на сервере, WOLF_TEST_MAX_FORKS=${WOLF_TEST_MAX_FORKS}): ${CMD[*]}"
  exec docker --context "$CTX" run --rm \
    -e "WOLF_TEST_MAX_FORKS=${WOLF_TEST_MAX_FORKS}" \
    "$IMAGE" "${CMD[@]}"
else
  echo "==> docker run (на сервере): ${CMD[*]}"
  exec docker --context "$CTX" run --rm "$IMAGE" "${CMD[@]}"
fi

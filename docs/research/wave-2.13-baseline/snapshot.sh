#!/usr/bin/env bash
# P200: baseline-снапшот «до» волны 2.13 (dogfood = репо Mr.Wolf, main).
# Методика: только чтение (help/analytics/events/файлы памяти); повторный прогон
# на неизменённом .wolf даёт тот же результат. Запуск: bash snapshot.sh <dogfood-root>.
# Примечания:
# - `wolf list --json` в 2.12.0 отсутствует (у list нет json-вывода) — id-снапшот
#   снимается напрямую по markdown-файлам .wolf/memory (id = имя файла;
#   frontmatter+body = файл целиком; body = после закрывающего `---`).
# - `wolf list`/`analytics` пишут mcp_call-телеметрию в session-metrics.jsonl
#   (обёртка with-cli-call) — на delivery-сигналы и sha256-снапшоты не влияет.
set -euo pipefail

DOGFOOD="${1:?usage: snapshot.sh <dogfood-root>}"
# Бинарь baseline = dist догфуд-репо (worktree потока dist не содержит).
CLI="$DOGFOOD/dist/bootstrap/cli.js"
OUT="$(cd "$(dirname "$0")" && pwd)"

# (а) реестр команд + help-бюджет
node "$CLI" --version > "$OUT/dogfood-version.txt"
node "$CLI" --help > "$OUT/dogfood-help.txt"
grep -c '^  ' "$OUT/dogfood-help.txt" > "$OUT/dogfood-help-command-lines.txt"

# (б) конфиг: размер + память таксономии
wc -l "$DOGFOOD/.wolf/config.yaml" > "$OUT/dogfood-config-wc.txt"
grep -n '^memory_types:' "$DOGFOOD/.wolf/config.yaml" > "$OUT/dogfood-config-memory-types.txt" || true

# (в) id-снапшот: id, type, status, sha256(body), sha256(frontmatter+body)
TSV="$OUT/dogfood-ids-sha256.tsv"
printf 'id\ttype\tstatus\tsha256_body\tsha256_full\n' > "$TSV"
find "$DOGFOOD/.wolf/memory" -name '*.md' -type f | LC_ALL=C sort | while read -r f; do
  id=$(basename "$f" .md)
  typ=$(awk '/^---$/{c++; next} c==1 && /^type:/{sub(/^type:[ ]*/,""); print; exit}' "$f")
  status=$(awk '/^---$/{c++; next} c==1 && /^status:/{sub(/^status:[ ]*/,""); print; exit}' "$f")
  full=$(shasum -a 256 "$f" | awk '{print $1}')
  body=$(awk 'BEGIN{c=0} /^---$/{c++; next} c>=2{print}' "$f" | shasum -a 256 | awk '{print $1}')
  printf '%s\t%s\t%s\t%s\t%s\n' "$id" "$typ" "$status" "$body" "$full" >> "$TSV"
done

# счётчики по типам/статусам
tail -n +2 "$TSV" | cut -f2 | sort | uniq -c | sort -rn \
  | jq -Rn '[inputs | sub("^ +"; "") | [splits(" +")] | {(.[1] // "null"): (.[0] | tonumber)}] | add' \
  > "$OUT/dogfood-counts-by-type.json"
tail -n +2 "$TSV" | cut -f3 | sort | uniq -c | sort -rn \
  | jq -Rn '[inputs | sub("^ +"; "") | [splits(" +")] | {(.[1] // "null"): (.[0] | tonumber)}] | add' \
  > "$OUT/dogfood-counts-by-status.json"

# (г) медиана суточных доставок, окно 7 дней от последнего дня с доставкой
# (нулевые дни внутри окна учитываются; сегодняшний день — частичный)
jq -s --arg today "$(date -u +%F)" '
  [.[] | select(.event == "delivery") | .ts[0:10]] as $days
  | def cnt($d): $days | map(select(. == $d)) | length;
  ([$today, ($days | max)] | max) as $last
  | ($last + "T00:00:00Z" | fromdateiso8601) as $lastts
  | [range(0; 7) | ($lastts - . * 86400) | todateiso8601[0:10]] as $window
  | ($window | map(cnt(.))) as $counts
  | { last_day: $last, window: $window
    , per_day: ([range(0; ($window | length)) | {day: $window[.], n: $counts[.]}])
    , median_7d: ($counts | sort | if length % 2 == 1 then .[length / 2 | floor] else (.[length / 2 - 1] + .[length / 2]) / 2 end)
    , total_all_time: ($days | length) }
' "$DOGFOOD/.wolf/metrics/session-metrics.jsonl" > "$OUT/dogfood-delivery-7d.json"

# (д) error-rate core-тулов: delivery-окно аналитики (снимок целиком)
(cd "$DOGFOOD" && node "$CLI" analytics --view delivery --json) > "$OUT/dogfood-analytics-delivery.json" 2>/dev/null

echo "OK: artifacts in $OUT"

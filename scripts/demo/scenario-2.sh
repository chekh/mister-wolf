#!/usr/bin/env bash
# Демо-сценарий 2: жизнь знания — рождение, устаревание (supersede), чтение актуального.
set -u
source "$(dirname "$0")/lib.sh"
new_demo_project

step "2.1 знание появляется: правило с атрибуцией автора"
WOLF_ACTOR="owner:chekh" node "$WOLF" add --type rule --scope project \
  --title "Правило: валидация товара перед addItem" \
  --body "cart.addItem требует проверки наличия до мутации корзины." >/dev/null 2>&1
V1=$(node "$WOLF" search "валидация товара перед" --hide-superseded 2>/dev/null | awk '{print $1}' | head -1)
check "правило создано (id получен)"                 "[ -n \"$V1\" ]"
check "автор = WOLF_ACTOR (owner:chekh)"             "node \"$WOLF\" get \"$V1\" 2>/dev/null | grep -q '\"created_by\": \"owner:chekh\"'"

step "2.2 знание устарело: v2 + supersede (не удаление — история сохраняется)"
V2=$(node "$WOLF" add --type rule --scope project \
  --title "Правило v2: валидация + резерв SKU" \
  --body "cart.addItem: inventory.reserve(sku); при отказе 409; мутация только после reserve." 2>/dev/null | grep -oE "mem_[a-z0-9_]+" | head -1)
node "$WOLF" supersede "$V1" "$V2" >/dev/null 2>&1
check "v1 помечена superseded"                       "node \"$WOLF\" get \"$V1\" 2>/dev/null | grep -q '\"status\": \"superseded\"'"
check "v1 знает преемника (superseded_by=v2)"        "node \"$WOLF\" get \"$V1\" 2>/dev/null | grep -q \"$V2\""

step "2.3 чтение через --latest всегда даёт актуальную версию"
HIT=$(node "$WOLF" get "$V1" --latest 2>/dev/null | grep -c "$V2" | tr -d ' ')
check "--latest вернул v2, а не v1"                  "[ \"$HIT\" -ge 1 ]"

step "2.4 поиск различает актуальное и устаревшее"
check "обычный search помечает [superseded]"         "node \"$WOLF\" search 'валидация товара' 2>/dev/null | grep -q '\[superseded\]'"
check "--hide-superseded убирает устаревшее"         "! node \"$WOLF\" search 'валидация товара' --hide-superseded 2>/dev/null | grep -q \"$V1\""

summary

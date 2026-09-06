#!/usr/bin/env python3
"""WEV-001 WC3 — точный bootstrap по кластерам-повторам (описательные стоимости).

Кластер = повтор кампании (спека §7.2). N=2 на руку → bootstrap-ресемплинг
с возвращением перечислим точно (3 мультипольных выбора на руку × 3 = 9 пар) —
детерминированно, без сида. CPSC/CSR не бустрапятся: успешных кампаний 0,
метрики неопределены (см. отчёт).

Вход: costs.csv (cost.sh, 28 эпизодных строк). Выход: текст в stdout.
"""
import csv
import itertools
from collections import defaultdict

camp = defaultdict(float)
with open("costs.csv", newline="", encoding="utf-8") as f:
    for r in csv.DictReader(f):
        camp[(r["repeat"], r["arm"])] += float(r["weight"])

base = [camp[("r1", "base")], camp[("r2", "base")]]
wolf = [camp[("r1", "wolf")], camp[("r2", "wolf")]]
print(f"BASE : r1={base[0]:.1f} r2={base[1]:.1f} total={sum(base):.1f}")
print(f"WOLF : r1={wolf[0]:.1f} r2={wolf[1]:.1f} total={sum(wolf):.1f}")
print(f"наблюдаемые дельты W−B: r1 {wolf[0]-base[0]:+.1f} ({wolf[0]/base[0]-1:+.1%}),"
      f" r2 {wolf[1]-base[1]:+.1f} ({wolf[1]/base[1]-1:+.1%})")
print(f"тотал W/B = {sum(wolf)/sum(base):.4f}")

diffs, ratios = [], []
for bi in itertools.product(range(2), repeat=2):
    for wi in itertools.product(range(2), repeat=2):
        mb = sum(base[i] for i in bi) / 2
        mw = sum(wolf[i] for i in wi) / 2
        diffs.append(mw - mb)
        ratios.append(mw / mb)
print(f"bootstrap (точное перечисление, 9 пар ресемплов):")
print(f"  diff  mean(W−B) per-campaign: CI [{min(diffs):.0f}; {max(diffs):.0f}]")
print(f"  ratio mean(W)/mean(B):        CI [{min(ratios):.3f}; {max(ratios):.3f}]")
print("CI содержит 1 → направленного сигнала по стоимости нет; MPE (W ≤ 0.85×B) не проверяем: CPSC неопределён.")

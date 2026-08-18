#!/bin/bash
# verify-council.sh — проверка Council Mode по файловым артефактам + системный журнал.
# Независимо пересчитывает голоса из файлов мнений и сверяет с синтезом wolf'а.
cd "$(dirname "$0")/.." || exit 1

echo "=== Проверка Council Mode (wolf-experiment) ==="

python3 - <<'PY'
import json, os, re, glob
from datetime import datetime

ok = lambda b: '✅ PASS' if b else '❌ FAIL'
warn = lambda b: '✅ PASS' if b else '⚠️  WARNING'
cfg = json.load(open('councils/config.json'))['councils']

SCN = {
    'SMOKE': ('COUNCIL-SMOKE', 'minimal', {'human_required': False}),
    '1': ('COUNCIL-TEST-001', 'architecture', {'human_required': False}),
    '2': ('COUNCIL-TEST-002', 'full', {'human_required': False}),
    '3': ('COUNCIL-TEST-003', 'security', {'human_required': False}),
    '4': ('COUNCIL-TEST-004', 'custom-mixed', {'human_required': False}),
    '5': ('COUNCIL-TEST-005', 'architecture', {'human_required': False, 'timeout_member': 'ux'}),
    '7': ('COUNCIL-TEST-007', 'full', {'human_required': True}),
    '8a': ('COUNCIL-TEST-008/round-1', 'custom-csv', {'human_required': False}),
    '8b': ('COUNCIL-TEST-008/round-2', 'custom-csv', {'human_required': False}),
}
VOTE_RE = re.compile(r'^VOTE:\s*(A|B|C|ABSTAIN|TIMEOUT)\s*$', re.M)
RESERVED = {'question', 'synthesis', 'escalation', 'final-decision'}
fails = 0

def votes_of(dirname):
    v = {}
    for f in sorted(glob.glob('councils/%s/*.md' % dirname)):
        base = os.path.basename(f)[:-3]
        if base in RESERVED:
            continue
        m = VOTE_RE.search(open(f).read())
        v[base] = m.group(1) if m else 'MISSING'
    return v

def check(label, cond):
    global fails
    print('   ', ok(cond) if cond is not None else warn(False), '-', label)
    if cond is False:
        fails += 1

for name, (dirname, cid, flags) in SCN.items():
    print('\nСценарий %s (%s, council=%s):' % (name, dirname, cid))
    sdir = 'councils/%s' % dirname
    if not os.path.isfile('%s/synthesis.md' % sdir):
        check('synthesis.md существует', False)
        continue
    c = cfg[cid]
    v = votes_of(dirname)
    syn = open('%s/synthesis.md' % sdir).read()
    # состав: все члены совета имеют файл мнения (или отмечены в syn как не ответившие)
    roles = [m.replace('council-', '') for m in c['members']]
    have = set(v)
    check('мнения всех членов (%d/%d)' % (len([r for r in roles if r in have]), len(roles)),
          all(r in have for r in roles))
    valid = [x for x in v.values() if x in ('A', 'B', 'C')]
    winner = max(set(valid), key=valid.count) if valid else None
    frac = valid.count(winner) / len(valid) if valid else 0.0
    quorum_ok = len(valid) >= c['quorum']
    cons_ok = quorum_ok and frac >= c['consensus_threshold']
    # сверка рекомендации wolf'а с пересчётом
    m = re.search(r'Рекомендация:\s*([ABC]|НЕ ПРИНЯТА)', syn)
    if cons_ok:
        check("рекомендация wolf'а = пересчёту (%s, %.2f)" % (winner, frac), m is not None and m.group(1) == winner)
    else:
        check("рекомендация НЕ ПРИНЯТА (quorum=%s, конс.=%.2f порог=%.2f)" % (quorum_ok, frac, c['consensus_threshold']),
              m is not None and m.group(1) == 'НЕ ПРИНЯТА')
    # разногласия
    split = len(set(valid)) > 1
    check("секция 'Разногласия' при расколе" if split else "единодушие — без разногласий",
          ('Разногласия' in syn) if split else True)
    # эскалация
    esc_expected = (not cons_ok) or flags['human_required']
    esc_exists = os.path.isfile('%s/escalation.md' % sdir)
    check('эскалация %s' % ('обязательна' if esc_expected else 'не требуется'),
          esc_exists if esc_expected else not esc_exists)
    if esc_exists and flags['human_required']:
        check("escalation содержит 'Требуется ваше решение'",
              'Требуется ваше решение' in open('%s/escalation.md' % sdir).read())
    # спец-проверки
    if 'timeout_member' in flags:
        check("участник %s = TIMEOUT" % flags['timeout_member'], v.get(flags['timeout_member']) == 'TIMEOUT')
        check("synthesis: Quorum + 'не ответил'",
              'quorum' in syn.lower() and 'не ответил' in syn.lower())
    if name == '7':
        fd = '%s/final-decision.md' % sdir
        check('final-decision.md (решение пользователя)', os.path.isfile(fd) and 'C' in open(fd).read())

print('\nСценарий 4 (глубина анализа по тирам моделей):')
try:
    la = len(open('councils/COUNCIL-TEST-004/architect.md').read().splitlines())
    lc = len(open('councils/COUNCIL-TEST-004/cost.md').read().splitlines())
    print('    %s - architect (glm-5.2) %d строк vs cost (turbo) %d строк' % (warn(la > lc), la, lc))
except OSError:
    print('    ❌ FAIL - файлы мнений S4 не найдены'); fails += 1

print('\nСценарий 6 (параллельные советы):')
a = os.path.isfile('councils/COUNCIL-TEST-006A/synthesis.md')
b = os.path.isfile('councils/COUNCIL-TEST-006B/synthesis.md')
check('оба synthesis существуют', a and b)
calls = []
for line in open('logs/spawn-log.jsonl'):
    d = json.loads(line)
    if d.get('event') != 'task.call':
        continue
    tag = str(d.get('subagent_type', '')) + ' ' + str(d.get('prompt', '')) + ' ' + str(d.get('description', ''))
    if '[COUNCIL-TEST-006' in tag and d.get('subagent_type', '').startswith('council-'):
        calls.append(datetime.fromisoformat(d['ts'].replace('Z', '+00:00')))
check('не менее 7 параллельных спавнов членов (по журналу)', len(calls) >= 7)
if len(calls) >= 2:
    spread = (max(calls) - min(calls)).total_seconds()
    check('диспетч одновременно (разброс %.0f c < 60 c)' % spread, spread < 60)

print('\nСценарий 8 (итерации):')
try:
    r1 = re.search(r'Рекомендация:\s*([ABC])', open('councils/COUNCIL-TEST-008/round-1/synthesis.md').read())
    r2 = re.search(r'Рекомендация:\s*([ABC])', open('councils/COUNCIL-TEST-008/round-2/synthesis.md').read())
    same = (r1 and r2 and r1.group(1) == r2.group(1))
    print('    %s - round-1: %s, round-2: %s (смена рекомендации при новой информации)'
          % (warn(not same), r1.group(1) if r1 else '?', r2.group(1) if r2 else '?'))
except OSError:
    print('    ❌ FAIL - раунды S8 не найдены'); fails += 1

print('\nИтог: %s (FAIL=%d)' % ('ЕСТЬ ПРОВАЛЫ' if fails else 'ВСЕ ЖЁСТКИЕ ПРОВЕРКИ ПРОЙДЕНЫ', fails))
exit(1 if fails else 0)
PY

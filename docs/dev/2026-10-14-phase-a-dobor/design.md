---
slug: phase-a-dobor
title: '2.18.0 — Фаза A добор (A9, A10, A11) + B0 доводка — дизайн'
status: review
created: 2026-10-14
requirements: docs/dev/2026-10-14-phase-a-dobor/requirements.md
review: pending
---

# 2.18.0 — Фаза A добор + B0 — дизайн

> **Стадия:** design, ожидает wolf-review перед plan/test-plan. Опирается на approved requirements.md (L0-решение `mem_20261014_otvety_l0_po_oq_01_05_trebovaniya_2_18_0_48611c`). Методика — `wolf-design`.

## 1. Глоссарий

- **A9 v2 contract** — расширенные `council-opinion` (7 полей) и `synthesis` (5 полей); изоляция формирования мнений — правило процесса в `.wolf/SKILL.md` и применимых шаблонах.
- **Claim heartbeat** — короткий файл `.wolf/shared/claims/<slug>.heartbeat`, обновляемый держателем; свежесть определяется mtime и опционально содержимым.
- **Heartbeat-окно** — `CLAIM_HEARTBEAT_WINDOW_MS` (дефолт 10 минут); новый параметр, не зависящий от `CLAIM_TTL_MS` (24h) и flock-таймаута (30s на запись).
- **Historical document** — публичный документ, описывающий удалённую/историческую функциональность; frontmatter `historical: true` + раздел «Историческое основание» в начале.
- **8 core types** — rule, decision, lesson, observation, context, face, complaint, note (см. `src/domain/memory-types.ts`); расширения — из roadmap-v3 (для справки в A10).
- **«Действующий контракт версии»** — раздел в публичном документе, описывающий текущее поведение с указанием версии и SHA.

## 2. Карта покрытия REQ → компонент → контракт → проверка

| REQ              | Компонент                                                                                                                                                  | Контракт                                                                                                           | Где проверяется                                                                                                                        | NFR                                                  |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| REQ-01 (A9)      | `src/domain/memory-types.ts` + `src/app/use-cases/build-analytics.ts` + `.wolf/SKILL.md` + `templates/base/skills/wolf-brainstorm/SKILL.md` (consilium)    | `CouncilOpinionV2` (см. §3.1) + `SynthesisV2` (см. §3.1)                                                           | unit (vitest): schema validation; integration: extractVote + new fields readable; e2e: new opinion + synthesis записываются и читаются | NFR-01 (обратная совместимость чтения legacy `vote`) |
| REQ-02 (A10)     | `tests/e2e/docs-audit.test.ts` (новый) + правки в `README.md`, `README.ru.md`, `docs/concept/concept.md`, `docs/README.md`, `docs/specs/*`, `docs/plans/*` | скрипт grep по `wolf learn`, `wolf run`, `Sandbox Replay`, `STOP-гейт` + frontmatter `historical: true` (см. §3.2) | e2e (CI): grep-скрипт зелёный                                                                                                          | NFR-02 (тест в CI)                                   |
| REQ-03 (A11)     | `src/adapters/fs/claim-registry.ts` + `src/app/use-cases/claim-artifact.ts` + `src/adapters/cli/commands/claim.ts` (новый подкоманд `heartbeat`)           | `heartbeatFilePath`, `readHeartbeat`, `writeHeartbeat`, `isStale` (расширенный, см. §3.3)                          | unit (vitest): synth-тест `claim-registry.test.ts` + heartbeat-файл                                                                    | NFR-03 (обратная совместимость 2.17.1 claim-файлов)  |
| REQ-04 (B0)      | `templates/base/agents/*.md` + `src/app/use-cases/init-project.ts` + `src/app/use-cases/sync-base-set.ts` + `src/app/use-cases/scaffold-agent.ts`          | per-agent face owner_skill consistency (см. §3.4)                                                                  | integration: tmp-каталог `wolf init` + `wolf call` + `wolf face show`; playground-lab e2e                                              | NFR-04 (совместимость 2.17.x)                        |
| REQ-05 (Release) | `package.json` + `CHANGELOG.md` + `npm version` + `git tag` + сайт `docs:build`                                                                            | релизный цикл (см. §3.5)                                                                                           | wolf-release-docs чек-лист                                                                                                             | NFR-05 (полный цикл)                                 |

**NFR (наследуются из 2.17.1 + новые):**

- NFR-01 — legacy `council-opinion` с `vote` без claims остаётся читаемым; новые поля опциональны, отсутствие = unknown (НЕ падение).
- NFR-02 — docs-audit-тест в CI (`npm run check` или эквивалент).
- NFR-03 — claim-файлы 2.17.1 интерпретируются как раньше; heartbeat opt-in.
- NFR-04 — проект на 2.17.x после upgrade до 2.18.0 + `wolf init` сохраняет существующие лица.
- NFR-05 — полный релизный цикл (см. `wolf-release-docs`).

## 3. Компоненты и контракты

### 3.1 A9 — расширение `council-opinion`/`synthesis`

**Файл:** `src/domain/memory-types.ts` (CORE_TAXONOMY_DECLS — добавить fields в `council-opinion` и `synthesis`).

**Псевдоконтракт (типы):**

```ts
// OQ-07: шкала confidence — 'low' | 'medium' | 'high' (уже есть в MemoryStatus нет —
//        введена в 2.13 как Confidence, проверить применимость)
type Confidence = 'low' | 'medium' | 'high';

interface EvidenceRef {
  // OQ-02: id объекта памяти + опционально цитата/комментарий
  memory_id?: string; // e.g. 'wolf:lesson:mem_...'
  path?: string; // e.g. 'docs/concept/concept.md#1.3'
  quote?: string; // ≤ 200 chars, цитата
  note?: string; // ≤ 500 chars, объяснение
}

interface CouncilOpinionV2 {
  // существующие:
  vote: string; // остаётся (NFR-01)
  // новые (REQ-01 AC-1, AC-2):
  claims: string[]; // массив утверждений; ≥1 для новой записи
  evidence: EvidenceRef[]; // массив ссылок на подтверждение
  assumptions: string[]; // предпосылки
  confidence: Confidence; // шкала из 2.13
  risks: string[]; // известные риски
  failure_conditions: string[]; // при каких условиях рекомендация не работает
  counterexamples: string[]; // контрпримеры
}

interface SynthesisV2 {
  // существующие (legacy):
  body: string;
  // новые:
  accepted_claims: string[]; // какие claims приняты
  rejected_alternatives: {
    // отвергнутые альтернативы с обоснованием
    claim: string;
    reason: string;
  }[];
  unresolved_dissent: string[]; // несогласованные пункты
  confidence: Confidence;
  required_validation: string[]; // что нужно проверить перед применением
}
```

**Изменения в схеме (CORE_TAXONOMY_DECLS):**

- Запись `council-opinion`: добавить fields `claims` (string[] required, min 1), `evidence` (EvidenceRef[] optional, default []), `assumptions`, `risks`, `failure_conditions`, `counterexamples` (string[] optional, default []), `confidence` (enum optional, default 'medium' — иначе NFR-01 нарушится для legacy).
- Запись `synthesis`: добавить fields `accepted_claims` (string[] required, min 1), `rejected_alternatives` (object[] optional), `unresolved_dissent`, `required_validation` (string[] optional, default []), `confidence` (enum optional, default 'medium').

**Изменения в `build-analytics.ts`:**

- Функция `extractVote` остаётся (`vote` поле); добавить `extractClaims(opinion)` и `extractSynthesisMeta(synthesis)`, читающие новые поля.
- `buildCouncils` — расширить возвращаемый тип `CouncilsView` (если есть) полями `audited_count` (сколько мнений с claims) и `unresolved_dissent_total`.
- NFR-01: legacy-объекты (без claims) не падают; для них `claims = []`, `confidence = 'low'` (маркер «неполные данные»).

**Изменения в `.wolf/SKILL.md`:**

- Добавить §X «Изоляция формирования мнений в советах» (процедурное правило):
  > «Каждый участник формулирует мнение ДО раскрытия ответов других участников. В сценарии, где порядок получения вопроса одинаков, ответы пишутся одновременно без чтения чужих drafts. Reveal-фаза — после submit всех.»

**Шаблоны:**

- В `templates/base/skills/wolf-brainstorm/SKILL.md` (если применимо) — указать формат `council-opinion` v2.
- Опционально: в `.wolf/orchestration/help/council-*.txt` — обновить примеры (не блокер).

**OQ-02 (формат claim/evidence):** `claim` — строка-утверждение (≤ 500 chars); `evidence` — массив структурированных ссылок с `memory_id` (предпочтительно), `path` (fallback), `quote` (опционально), `note` (опционально). Поле body остаётся для markdown-комментариев.

**OQ-03 (миграция legacy):** legacy `council-opinion` без claims НЕ переписываются. Валидация: при создании новой записи (`createObject`) — `claims` обязателен (min 1), иначе ошибка. Legacy читается через `extractClaims` с fallback `[]`. Команды миграции не требуется.

### 3.2 A10 — аудит публичных документов

**Файл:** `tests/e2e/docs-audit.test.ts` (новый) — vitest-тест, проверяющий:

- `README.md`, `README.ru.md`, `docs/concept/concept.md`, `docs/README.md` НЕ содержат инструкций (т.е. повелительного наклонения или фрагментов кода) с `wolf learn`, `wolf run`, `Sandbox Replay`, `STOP-гейт`. Допустимы: явные пометки «историческое основание», «архив», ссылки на архивные файлы.
- `docs/specs/2026-08-26-self-learning-design.md`, `docs/dev/roadmap/roadmap-v2.md` и аналогичные — frontmatter содержит `historical: true` ИЛИ раздел «Историческое основание» в первых 50 строках.
- Все публичные документы ≥ 5 KB имеют раздел «Действующий контракт» (heading `^#+ Действующий контракт` или эквивалентный) с указанием версии (`2.17.x` или `2.18.0`).
- Счётчик типов: в README, concept.md, docs/README.md нет «25 типов» / «25+ типов»; допустимо «8 core-типов» / «8 core + расширения».

**Правки в `README.md` / `README.ru.md` / `docs/concept/concept.md`:**

- Заменить инструкции с `wolf learn` на `wolf add --type lesson` (прецедент README.md:23).
- Удалить ссылки на `Sandbox Replay` / `wolf run` (заменить на `solve --save` / `wolf analytics` — действующие аналоги).
- Таблицу 6–8 (в README) переписать без удалённых команд; оставить только действующие.
- `docs/concept/concept.md` — вычистить строки с `Sandbox Replay` (строка 1) и `learn` в §E0; добавить раздел «Действующий контракт v2.18.0» в начало.

**Правки в спецификациях (только frontmatter + заголовок):**

- Добавить YAML frontmatter `historical: true` + однострочный `summary` (например, `summary: Историческое основание — описание контура self-learning, не реализованного в 2.18.0`).
- НЕ переписывать содержимое body. Только добавить frontmatter и (опционально) раздел «Историческое основание» в первых 30 строках.

**Алгоритм grep (псевдокод):**

```ts
const FORBIDDEN_TOKENS = [
  /`wolf learn`/g, // backticked form (instruction)
  /`wolf run`/g,
  /`Sandbox Replay`/g,
  /`STOP-гейт`/g,
];
const ALLOWED_CONTEXT = [/историческ/i, /архив/i, /удалён/i, /removed/i];
function auditFile(path: string): { ok: boolean; hits: Array<{ line: number; text: string }> } {
  const content = readFileSync(path, 'utf-8');
  const hits = [];
  for (const re of FORBIDDEN_TOKENS) {
    let m;
    while ((m = re.exec(content)) !== null) {
      const line = content.slice(0, m.index).split('\n').length;
      const window = content.slice(Math.max(0, m.index - 100), m.index + 100);
      if (!ALLOWED_CONTEXT.some((r) => r.test(window))) {
        hits.push({ line, text: content.split('\n')[line - 1] });
      }
    }
  }
  return { ok: hits.length === 0, hits };
}
```

### 3.3 A11 — heartbeat-файл в claim-реестре

**Файлы:**

- `src/adapters/fs/claim-registry.ts` — добавить `heartbeatFilePath`, `readHeartbeat`, `writeHeartbeat`, расширить `isStale`.
- `src/app/use-cases/claim-artifact.ts` — добавить `heartbeatArtifactClaim(deps, artifact)` use-case.
- `src/adapters/cli/commands/claim.ts` (или новый файл) — команда `wolf claim heartbeat <artifact>` (опционально, для ручного продления).

**Контракты (типы):**

```ts
/** Heartbeat-файл: mtime + (опционально) содержимое с ISO-временем. */
export interface HeartbeatRecord {
  /** ISO-время последнего heartbeat. */
  written_at: string;
  /** Идентификатор писателя (для отладки, не auth). */
  writer: string;
}

export const CLAIM_TTL_MS = 24 * 60 * 60 * 1000; // 24h (без изменений)
export const CLAIM_HEARTBEAT_WINDOW_MS = 10 * 60 * 1000; // 10 минут (новый, OQ-01)

export function heartbeatFilePath(root: string, artifact: string): string {
  return join(claimsDir(root), `${claimSlug(artifact)}.heartbeat`);
}

export function readHeartbeat(path: string): HeartbeatRecord | null {
  // statSync.mtimeMs + (если нужно) parse JSON
  // Возврат: null при отсутствии/повреждении
}

export function writeHeartbeat(deps: ClaimRegistryDeps, input: { artifact: string; writer: string }): HeartbeatRecord {
  // wx-create (как в FsMemoryLock), атомарно
  // Содержимое: JSON { written_at, writer }
  // mtime — обновляется при записи (не полагаемся только на mtime — JSON парсим)
}

export function isStale(rec: ClaimRecord | null, hb: HeartbeatRecord | null, deps: ClaimRegistryDeps): boolean {
  if (rec === null) return true;
  const alive = deps.isAlive ?? pidAlive;
  if (!alive(rec.pid)) return true;
  const acquired = Date.parse(rec.acquired_at);
  if (Number.isNaN(acquired)) return true;
  const now = (deps.now ?? (() => new Date()))().getTime();
  // TTL 24h (без heartbeat не спасает, как и сейчас)
  if (now - acquired > CLAIM_TTL_MS) return true;
  // Heartbeat: если есть — свежесть обязательна; нет heartbeat → fallback на 2.17.1 поведение
  if (hb !== null) {
    const written = Date.parse(hb.written_at);
    if (Number.isNaN(written)) return true; // повреждён = stale
    if (now - written > CLAIM_HEARTBEAT_WINDOW_MS) return true;
  }
  return false;
}
```

**Псевдокод acquire (расширение 2.17.1):**

```ts
function acquireClaim(deps, input) {
  // ... существующая логика (acquire, fail, stale) ...
  // Изменение: вместо isStale(rec, deps) использовать isStale(rec, readHeartbeat(...), deps)
}
```

**Backward compat (NFR-03):**

- Claim-файлы 2.17.1 (без heartbeat-файла) → `readHeartbeat` возвращает `null` → `isStale` ведёт себя как в 2.17.1 (PID + acquired_at > 24h). Heartbeat opt-in.
- Новый acquire (2.18.0) НЕ создаёт heartbeat автоматически — держатель должен вызвать `wolf claim heartbeat` (или интегрированный API) в рамках длительной операции.

**Flock-таймаут (допущение L0):** текущий код использует `openSync(..., 'wx')` — это `O_CREAT | O_EXCL` (атомарно), без flock; 30-секундная величина в брифе — это таймаут `Atomics.wait` (line 102: `sleepMs`); не блокирует acquire дольше установленного предела. Уточнить в дизайне через grep `flock` / `Atomics`.

### 3.4 B0 — доводка базовых наборов

**Файлы:**

- `templates/base/agents/*.md` — синхронизация `mode`/`model`/инструментов с реальной ролью.
- `src/app/use-cases/init-project.ts` — проверить, что `seed` создаёт лица с правильным `owner_skill` (соответствие `agent_id`).
- `src/app/use-cases/sync-base-set.ts` — гарантия «не перезаписывать локальные мутации» (проверка: если файл изменён локально, sync не трогает; если изменился шаблон — пометить `mutated-skip`, как уже в 2.17.1).
- `src/app/use-cases/scaffold-agent.ts` — создание лица с `owner_skill = <agent_id>`.

**Контракты:**

```ts
// В src/app/use-cases/init-project.ts
interface BaseSetSpec {
  agent_id: string; // 'executor-lead' | 'steward' | 'worker-implementer' | ...
  face_owner_skill: string; // ДОЛЖЕН совпадать с agent_id
  mode: 'primary' | 'all' | 'subagent';
  tools: readonly string[]; // ожидаемый набор (для проверки)
  path: string; // относительный путь в .opencode/
}
```

**NFR-04 (совместимость 2.17.x):**

- Проект, инициализированный в 2.17.x, при обновлении до 2.18.0 + `wolf init --yes`:
  - Если steward-мутнувшее лицо — не трогать (зона Стюарда).
  - Если шаблон изменился — обновить ТОЛЬКО через стандартный `re-init` путь 2.17.1 (с `initiator: seed`).
  - Локальные мутации пользователя (не Стюарда) — НЕ перезаписывать (`mutated-skip`).

**Проверка на playground-lab (OQ-06):**

- E2E-сценарий: `cd playground-lab && wolf init --full --platform opencode --yes` → проверка:
  - `templates/base/agents/*.md` соответствуют установленным `.opencode/agent/*.md`.
  - `wolf face show <each-base-agent>` возвращает `owner_skill == agent_id`.
  - `wolf call` возвращает ожидаемый список инъекций для каждого базового агента.

### 3.5 REQ-05 — релизный цикл

**Опирается на скилл `wolf-release-docs` (L0 грузит).** Содержание этапа:

1. `npm version 2.18.0` (bump MINOR; правило `mem_20260831_vedenie_versiy_package_json_edinstvennyy_004788`).
2. `CHANGELOG.md` — секция `## 2.18.0` с REQ-01..04.
3. README.md / README.ru.md — синхронизация с новой функциональностью (особенно A9 + A11).
4. Сайт: `docs:build` + деплой; страница Changelog синхронизирована.
5. `git tag v2.18.0`; `npm publish` (правило `mem_20260903_rol_wolf_ne_ispolnyat_lichno_tolko_dispe_e95317` — НЕ сам Wolf, делает владелец/L0).
6. Acceptance-отчёт (L1) — отдельный документ с evidence по каждому REQ.

## 4. ADR (Architecture Decision Records)

### ADR-7 — A11 heartbeat-файл vs TTL-маркер

- **Контекст:** Внешняя экспертиза указала на риск: длительная операция может потерять claim при истечении TTL. Два варианта: (1) heartbeat-файл `.wolf/shared/claims/<slug>.heartbeat`; (2) TTL-маркер `last_heartbeat_at` в существующем JSON.
- **Альтернативы:**
  - (1) heartbeat-файл — отдельная сущность, атомарно обновляется через `wx-create` (прецедент `FsMemoryLock`); не трогает существующий claim-файл; проще отладка (`ls .wolf/shared/claims/`).
  - (2) TTL-маркер в JSON — перезапись всего claim-файла каждые N секунд; больше операций записи; требует пересмотра `linkSync`-следа.
- **Решение L0:** (1) heartbeat-файл.
- **Последствия:** новая сущность на диске (1 файл на active claim); claim-файл остаётся без изменений; обратная совместимость через `readHeartbeat → null` = нет heartbeat = правила 2.17.1.
- **Риск:** два процесса пишут heartbeat одной сессии → гонка. Решается `wx-create` (excl) + потеря старой записи (heartbeat-файл не имеет следа, в отличие от claim). Последний выигрывает, без следов.
- **Проверка допущения:** synth-тест `claim-registry.test.ts` (X и Y пишут heartbeat параллельно → последний выигрывает; requireClaim X проходит, пока свежий; после истечения окна — Y перехватывает).

### ADR-8 — A9 изоляция формирования мнений — правило процесса, не код

- **Контекст:** «Каждое мнение — до раскрытия ответов других участников» — требует контроля доступа или trusted runtime.
- **Альтернативы:**
  - (1) правило процесса в `.wolf/SKILL.md` + шаблоны.
  - (2) технический контроль (отдельный run для каждого участника, без общего канала).
- **Решение:** (1) — соответствует духу roadmap-v3 (governed learning, не trusted runtime).
- **Последствия:** изоляция может быть нарушена вручную; код не защищает. Документировано явно, ошибки = нарушение процедуры, не баг.
- **Риск:** low; фиксируется в `wolf-brainstorm` skill (если он используется для консилиумов) и в `.wolf/SKILL.md` §X.

### ADR-9 — A9 confidence: шкала `low`/`medium`/`high` (из 2.13 Confidence)

- **Контекст:** OQ-07 — какая шкала confidence?
- **Альтернативы:** 0..1, %, low/medium/high (уже есть в 2.13 `Confidence`), иное.
- **Решение:** `Confidence` из 2.13 (ничего нового не вводим).
- **Последствия:** legacy-объекты без `confidence` (большинство) получают default `'medium'` (не 'unknown', чтобы не плодить ветку условий).
- **Проверка:** см. NFR-01 + тест schema.

### ADR-10 — A10 объём = полный `docs/**` аудит

- **Контекст:** L0-решение (OQ-05) — полный проход `docs/**` с маркером `historical: true` для удалённых команд.
- **Альтернативы:** (a) полный аудит всех `docs/**`; (b) минимальный (только README/concept).
- **Решение:** (a) — выбран L0.
- **Последствия:** больше работы (≈ 30+ спецификаций в `docs/specs/`); но системно: ни один документ не врёт.
- **Объём работы:** A10 — worktree `2.18.0-a10` (после A9 + B0), scope = `docs/**` (read+write в allowlist). Скрипт `tests/e2e/docs-audit.test.ts` — регрессия в CI.

## 5. NFR (детализация)

### NFR-01 — обратная совместимость чтения legacy

- Существующие `council-opinion`/`synthesis` без новых полей читаются; `extractClaims` возвращает `[]`; `confidence` default `'medium'`.
- Existing `buildCouncils` (статистика) — не падает, не возвращает мусор.

### NFR-02 — docs-audit-тест в CI

- `tests/e2e/docs-audit.test.ts` — vitest с `readFileSync` + grep-логикой; входит в `npm run check` (или эквивалент — TBD с учётом профиля проекта).
- Покрытие: 4 ключевых файла (README*, concept.md, docs/README.md) + frontmatter `historical: true` в `docs/specs/*.md`+`docs/plans/\*.md`.

### NFR-03 — claim-файлы 2.17.1 совместимы

- Claim без heartbeat → `readHeartbeat = null` → правила 2.17.1.
- Heartbeat opt-in: `wolf claim heartbeat <artifact>` — явная команда (не автоматическая).
- Существующий `claim-artifact.ts` API — без breaking changes.

### NFR-04 — проект 2.17.x → 2.18.0

- `wolf init --yes` после upgrade: re-init стандартный путь 2.17.1 (initiator `seed`).
- steward-мутнувшие лица — `diverged` (не трогать).
- локальные мутации пользователя — `mutated-skip`.
- smoke-тест: `playground-lab` (`npm run check` или аналог) после upgrade.

### NFR-05 — полный релизный цикл

- `wolf-release-docs` чек-лист зелёный; `npm version` + `git tag` + `npm publish` + `docs:build` + деплой.

## 6. Отказы, идемпотентность, восстановление, observability, миграции

- **A9:** отказ = `confidence` default для legacy; не падает.
- **A10:** отказ = grep-скрипт false positive (false alarm); регрессия в CI; не блокер публикации (можно фиксить в 2.18.1).
- **A11:** отказ = heartbeat-файл не пишется (процесс упал) → через 10 минут claim stale; штатное поведение. Идемпотентность: `writeHeartbeat` — `wx-create` + `unlink-then-recreate` (если mtime старше heartbeat-окна); атомарность через существующий `FsMemoryLock` прецедент. Миграции: не требуются (opt-in).
- **B0:** отказ = scaffold-agent не создал лицо → `wolf doctor` обнаруживает, `init --fix` дозавершает (прецедент 2.17.1 REQ-03, REQ-04).

## 7. Технические бюджеты

- **A9:** schema — расширение `CouncilOpinionV2` + `SynthesisV2`; +2 поля в type-schema-builder; +1 функция в `build-analytics.ts`; ≤ 100 строк.
- **A10:** docs-audit test — 1 vitest-файл, ≤ 200 строк; правки README/concept — ≤ 50 строк; frontmatter в спецификациях — 1 строка на файл × ~30 файлов.
- **A11:** heartbeat-функции — 4 новых функции в `claim-registry.ts`; +1 use-case в `claim-artifact.ts`; +1 CLI-команда (опционально); ≤ 150 строк.
- **B0:** правки `templates/base/agents/*.md` — точечные; ≤ 50 строк суммарно; smoke-тест на playground-lab.

**Производительность (A11):** heartbeat пишется каждые ~3 минуты (1/3 окна 10 мин); запись — `wx-create` + JSON; cost ≤ 5ms; не блокирует основной поток. Совместимо с NFR-03 (opt-in).

## 8. Допущения, требующие проверки

- **DAP-1 (L0):** flock-таймаут 30s относится к `Atomics.wait` (`claim-registry.ts:102`), не к acquire. Проверить через grep `flock` / `Atomics` (на design-стадии уже сделано; зафиксировать в §3.3).
- **DAP-2:** `CLAIM_HEARTBEAT_WINDOW_MS` = 10 минут (L0) калибруется в design; первая версия 10 минут фиксируется, изменение в будущем — через PR.
- **DAP-3:** `Confidence` enum из 2.13 (low/medium/high) применим; проверить `src/domain/memory-types.ts:24` — `export type Confidence = 'low' | 'medium' | 'high';` — подтверждено.

## 9. Готовность к плану

- ✅ Все REQ-01..04 покрыты компонентами/контрактами/проверками.
- ✅ ADR-7..10 зафиксированы (L0 + L1-решения).
- ✅ NFR-01..05 определены.
- ✅ Допущения DAP-1..3 проверены/зафиксированы.
- Следующий шаг: wolf-review → wolf-plan + wolf-testplan.

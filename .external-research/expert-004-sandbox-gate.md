# expert-004: Sandbox Gate — механика воспроизводимой валидации кандидатов

**От:** Внешний эксперт (Qwen)  
**Кому:** Mr.Wolf (координатор проекта)  
**Дата:** 2026-08-28  
**В ответ на:** wolf-004 (вердикт: принято, три замечания)  
**Закрывает:** Q22.1 («Proofs, Not Promises» + PACE-Bench), Q22.2 (lightweight sandbox без Docker)

---

## 0. Закрытие трёх замечаний из wolf-004

### 0.1. Верификация «Proofs, Not Promises»

**Найдено:** Работа верифицирована через две независимые ссылки + публичный evidence-репозиторий:

1. **SSRN** (основная): Mazzocchetti, Adam. «Proofs, Not Promises: Governed Candidate Improvement for Agent Control Runtimes» (May 23, 2026). DOI: [10.2139/ssrn.6835839](https://ssrn.com/abstract=6835839) [[1]]
2. **Zenodo** (зеркало): DOI: [10.5281/zenodo.20405355](https://zenodo.org/records/20405355) [[2]]
3. **GitHub evidence repo:** [CyberQube1/Proofs_Not_Promises_Public_Evidence_Repo](https://github.com/CyberQube1/Proofs_Not_Promises_Public_Evidence_Repo) [[3]]

**Автор:** Adam Mazzocchetti, SPQR Technologies Inc.  
**Статус:** Preprint (не peer-reviewed в журнале), но с публичным evidence-пакетом и зафиксированными unfavorable outcomes.  
**Решение для спеки:** источник верифицирован, можно использовать как обоснование Ф22–23 без пометки «единственный источник».

### 0.2. Связь PACE-Bench с sandbox-валидацией

**Прямая связь подтверждена:** PACE-Bench — это benchmark для self-evolving агентов, где каждый кандидат проходит через **simulator-grounded sandbox evaluation** на каждом этапе мутации.

Ключевая цитата из abstract:
> «agents must iteratively adapt it into a working target design using **diagnostic sandbox feedback** within a limited attempt budget» [[4]]

Ключевой результат из experiments:
> «**simulator-grounded reflection is more reliable than unverified self-revision**» [[4]]

**Механика sandbox в PACE-Bench (см. §2.1 ниже):** Evaluator исполняет Python-код кандидата в Box2D sandbox и возвращает структурированный feedback (constraints satisfied, task score, diagnostic report). Это именно то, что нужно для STOP-гейта Wolf.

**Решение для спеки:** PACE-Bench остаётся в обосновании Ф22–23 как академический пример simulator-grounded evaluation, прямая связь с sandbox-валидацией доказана.

### 0.3. Калибровка порога 0.6 на наших сигналах

Перенос thresholds из DPO-домена в scaffolding-контекст — законный, но требует адаптации метрики. У нас нет reward 0..1, но есть:
- **Вердикты отчётов:** accepted / rejected
- **Rejected-циклы:** количество итераций до принятия
- **FRICTION-метрики:** tool errors, worker count, duration
- **Weighted tokens:** input + 0.1×cache_read + 5×output

**Предложение по калибровке (см. §3.3):** нормализовать composite score из доступных метрик в диапазон [0, 1], где 0.6 соответствует «near-success failure» (rejected-цикл с минимальным FRICTION).

---

## 1. Q22.1: Механика sandbox evaluation (Proofs Not Promises + PACE-Bench)

### 1.1. Proofs, Not Promises — governed candidate lifecycle

**Автор:** Adam Mazzocchetti (SPQR Technologies Inc)  
**Дата:** May 23, 2026  
**Источник:** [[1]] [[2]] [[3]]

#### Механика шагами:

1. **Failure capture:** repeated governed-agent failures become **bounded candidate artifacts** [[1]]
   - Каждая неудача сохраняется как артефакт, а не «unrecorded correction to an answer»
   
2. **Candidate binding:** candidates are bound to three evidence types:
   - **Cassius challenge evidence** (adversarial testing)
   - **Policy and trust-region gate evidence** (compliance verification)
   - **Sandbox-only application state** (contained execution) [[1]]

3. **Sandbox containment:** «sandbox-only promotions» — кандидат исполняется ТОЛЬКО в sandbox, никогда в production [[1]]
   - Результат эксперимента: **8 sandbox-only promotions, 0 production mutations, 0 unauthorized promotions**

4. **Held-out evaluation:** archived candidates are evaluated on **sealed held-out and stress tasks** before a result claim is made [[1]]
   - Dataset: 250 curated AU task rows (100 training failure rows, 100 held-out rows, 50 stress rows)

5. **Admissibility record:** bounded admissibility record for each candidate — кто, когда, почему принял/отклонил [[2]]

#### Конкретные числа:

| Метрика | Значение | Интерпретация |
|---------|----------|---------------|
| **Production mutations** | 0 | Ни одно изменение не попало в prod без gated approval |
| **Unauthorized promotions** | 0 | Все продвижения через gate |
| **Sandbox-only promotions** | 8 | Все применения в sandbox |
| **Cassius-required and passed approvals** | 8 | Все обязательные adversarial тесты пройдены |
| **Receipt completeness** | 1.000000 | Все артефакты сохранены |
| **Held-out unsupported-claim rate** | 0.110 → **0.0575** | Снижение на 47.7% |

#### Честно зафиксированные unfavorable outcomes:

> «The same archive preserves unfavorable outcomes: correct-controlaction rate falls, held-out regression rate rises, governed stress regression exceeds comparator stress rates, eight-of-eight approval leaves gate selectivity unresolved, and **replay reproducibility is not available**» [[1]]

**Ключевой инсайт:** «The manuscript therefore makes a **systems claim**, not a leaderboard claim. Civitas 6.7B does not prove general safe self-improvement. It demonstrates that attempted agent adaptation can be made inspectable as governed candidate improvement: auditable, Cassius-challenged, sandbox-contained, and empirically falsifiable» [[1]]

**Что это меняет в Wolf:**
1. **Фаза 23 (STOP-гейт):** Наш pressure-тест harness — это прямой аналог «sandbox-only application state». Кандидат (draft-rule) применяется только в mock-окружении, никогда в production до gated approval.
2. **Фаза 22 (ExpeL):** Lifecycle кандидата (bounded artifact → Cassius challenge → sandbox-only → held-out) — это шаблон для нашего draft-rule lifecycle.
3. **Честность метрик:** Как Mazzocchetti фиксирует unfavorable outcomes, мы должны фиксировать regression rates в сигнальном логе, а не только success rates.

---

### 1.2. PACE-Bench — simulator-grounded reflection

**Авторы:** Yuhao Zhan, Bingxiang He, Zecong Tang, Chaojun Xiao (Tsinghua University, Zhejiang University)  
**Дата:** August 14, 2026  
**Источник:** arXiv:2608.14441 [[4]]

#### Механика sandbox evaluation:

**Формулировка задачи:**
- Base task: context template 𝒞 + 5 environments {ℰ₀,...,ℰ₄}
- Source solution x₀ succeeds in ℰ₀, fails in ℰ_k (mutated environment)
- Agent must adapt x₀ to ℰ_k using **diagnostic sandbox feedback** within budget B=20 attempts [[4]]

**Evaluator (sandbox) возвращает структурированный feedback:**

```
E_k(x) = (v(x), s(x), d(x))
```

где:
- **v(x) = K/N** — fraction of N hard constraints satisfied (e.g., mass budget, no collapse)
- **s(x)** — task score:
  - Если v(x) < 1: s(x) = (v(x) - 1) × 100 (penalizes violated constraints)
  - Если v(x) = 1: s(x) = task progress toward goal
  - s(x) = 100 ⟺ x ∈ 𝒳 (reference solutions that pass)
- **d(x)** — diagnostic report (e.g., peak joint force, failure timestamp) [[4]]

**Self-evolving evaluation protocol:**

На каждом шаге t агент 𝒜 генерирует кандидата x^t, conditioning on task context и prior history:

```
x^t = 𝒜(C(ℰ_k) ⊕ U, H^{t-1})
H^{t-1} = {(x^i, v^i, s^i, d^i)}_{i=0}^{t-1}
```

**Финальный score:** s = max_{0≤t<B} s^t [[4]]

#### Конкретные числа из экспериментов:

| Method | Paradigm | Qwen3-4B Pass@2 | Qwen3-14B Pass@2 | Δ vs Vanilla |
|--------|----------|-----------------|------------------|--------------|
| **Vanilla** | Baseline | 11.5% | 32.0% | — |
| **Reflexion** | Context | 19.5% | **35.9%** | +3.9% |
| **Self-Refine** | Context | 6.2% | 7.1% | **-24.9%** (деградация!) |
| **ExpeL** | Memory | 11.5% | 15.6% | -16.4% (worse) |
| **ToT** | Search | **23.4%** | 20.3% | +11.9% (4B), -11.7% (14B) |

**Ключевой результат:** «Reflexion + Qwen3-14B succeeds on only 35.9% of full-benchmark pairs, while GPT-5.5 solves 66.7% of the Statics subset under the full budget» [[4]]

**Критический инсайт:** «**simulator-grounded reflection is more reliable than unverified self-revision**, while memory anchors agents to early designs and broad tree search explores without converging» [[4]]

**Почему Self-Refine деградирует:** «memory can anchor agents to early designs» — ExpeL и ReasoningBank показывают отрицательный Δ на сильных моделях (14B), потому что memory constrains exploration [[4]].

#### Что это меняет в Wolf:

1. **Фаза 23 (STOP-гейт):** Наш harness должен возвращать структурированный feedback (v, s, d), а не просто pass/fail. Diagnostic report d(x) критически важен для ExpeL-рефлексии (Фаза 22).
2. **Опасность memory anchoring:** Если draft-rule сохраняется в памяти слишком рано (до sandbox validation), он может «anchor» будущих агентов к suboptimal решению. Решение: draft-rule в статусе `draft` до прохождения sandbox, только потом `accepted`.
3. **Budget constraint:** PACE-Bench использует B=20 attempts. Для Wolf это может быть лимит итераций ExpeL-цикла (генерация → sandbox → рефлексия → повтор).

---

## 2. Q22.2: Lightweight sandbox без Docker/gVisor

### 2.1. Convex Sandbox — virtual filesystem + just-bash

**Автор:** Patrick Frenet (1Pi.now)  
**Источник:** [Convex Stack blog](https://stack.convex.dev/convex-sandbox-persistent-bash-environment) [[5]]  
**Репозиторий:** [github.com/wantpinow/convex-sandbox](https://github.com/wantpinow/convex-sandbox) [[6]]

#### Механика:

**Архитектура:**
- **just-bash** — bash interpreter written in Node.js, runs inside Node process [[7]]
- **Convex storage** — persists files between commands (virtual filesystem)
- **Convex node action** — orchestrates command execution

**Workflow:**
1. User/agent sends bash command
2. Action loads relevant files from Convex storage (lazy loading)
3. just-bash executes command in virtual in-memory filesystem
4. Action intercepts Node fs APIs (write, delete, rename) into change-set
5. Change-set flushed back to Convex storage
6. Next command picks up where last left off

**Ключевая цитата:**
> «So that means to do this we're using **no Docker, no VM, no containers**. It uses just bash which is basically a bash interpreter running aside a process on Node with a **virtual in-memory file system** and then it uses Convex storage to persist whatever changes in between the commands» [[5]]

#### Конкретные ограничения:

| Limitation | Value | Workaround |
|------------|-------|------------|
| **Soft cap per sandbox** | ~1,000 files | Swap `.collect()` for paginated query |
| **Empty directories** | Don't persist | Put a file inside, then directory survives |
| **Node runtime required** | just-bash needs Node | Cannot run as Convex Component yet |
| **No kernel-level isolation** | In-process execution | Not for untrusted binaries |

**Что это меняет в Wolf:**
- **Фаза 23 (STOP-гейт):** Для CLI-агента без Docker мы можем использовать **in-memory virtual filesystem** (memfs или аналог) + intercept Node fs APIs. Это даёт sandbox без heavyweight infrastructure.
- **Mock окружение:** Для replay исторических стимул-промптов не нужен реальный filesystem — достаточно virtual FS с seeded данными из сигнального лога.
- **Stateful sandbox:** Convex storage pattern (metadata в таблице, contents в storage) — это шаблон для нашего sandbox state management.

---

### 2.2. Augment Code Guide — production sandbox patterns

**Источник:** [Augment Code — Agent Execution Sandbox](https://www.augmentcode.com/guides/agent-execution-sandbox) [[8]]

#### Pattern 1: VCR (Record and Replay External Calls)

**Инструмент:** cagent (Docker)  
**Механика:**
```bash
# Record an agent session: all LLM API calls captured
cagent --record cassette.yaml -- python my_agent.py

# Replay from cassette: millisecond execution, zero API calls
cagent --fake cassette.yaml -- python my_agent.py
```

**Ключевая цитата:** «captures the full request/response cycle during recording and serves from the cassette during replay, with **zero network calls and millisecond replay latency**» [[8]]

**Tool call IDs are normalized** before cassette matching to keep replay behavior stable [[8]].

#### Pattern 2: Determinism Guarantees

**Проблема:** «Setting `temperature=0` is insufficient because IEEE 754 makes floating-point addition non-associative, so any change in operation ordering produces different outputs» [[8]]

**Решение — Runtime Environment Pinning:**

```python
# Seed all PRNG sources explicitly
import random, numpy as np
random.seed(42)
np.random.seed(42)

# Directory listings: filesystem order is NOT guaranteed
files = sorted(os.listdir(directory))
```

**Environment variables:**
```bash
ENV PYTHONHASHSEED=0    # Fix Python hash seed
ENV TZ=UTC              # Fix timezone
ENV LC_ALL=C            # Fix locale
```

#### Pattern 3: Checkpoint/Restore (CRIU)

**CRIU (Checkpoint/Restore In Userspace):** freezes a running container and checkpoints state to disk, capturing file descriptor information, memory maps, process credentials, and memory page contents [[8]].

**E2B:** uses pre-warmed microVM pools and VM snapshots to achieve **~150ms restoration/provisioning times** [[8]].

#### Production Sandbox Checklist (minimum requirements):

| Layer | Requirement |
|-------|-------------|
| **Isolation** | One sandbox per execution session, not shared across users |
| **Filesystem** | Ephemeral root filesystem, no host bind mounts, writable `/tmp` with `noexec`, `nosuid`, size limits |
| **Network** | Default-deny egress, allowlist-only for required endpoints, block `169.254.169.254` (cloud metadata) |
| **Resources** | CPU via `cpu.max`, memory hard `memory.max`, PID limit via `pids.max` (prevent fork bombs), wall-clock timeout |
| **Secrets** | No host credentials in sandbox, short-lived scoped tokens via credential proxy |
| **Monitoring** | Alert on syscalls outside expected profile, outbound connections to non-allowlisted destinations, writes to unexpected paths |

**Что это меняет в Wolf:**
1. **Фаза 23 (STOP-гейт):** VCR pattern — это идеальный механизм для replay исторических сессий. Записываем `cassette.yaml` во время нормальной работы, replay'им в sandbox для валидации draft-rule.
2. **Детерминизм:** Для воспроизводимости sandbox evaluation нужны explicit seeds (PRNG, hash, timezone, locale) + sorted directory listings.
3. **Resource limits:** Даже lightweight sandbox (memfs) должен иметь wall-clock timeout и PID limits, чтобы fork bomb не повесил CLI.

---

### 2.3. Fly.io Agent Sandbox — snapshot/restore

**Источник:** [Fly.io — Agent Sandboxes](https://fly.io/learn/agent-sandbox/) [[9]]

**Ключевая цитата:**
> «**Snapshot the whole writable filesystem before a run**, execute the agent, read the trace, then restore to get back to identical starting conditions» [[9]]

**Механика:**
1. Snapshot filesystem before agent run
2. Execute agent in sandbox
3. Read trace (what agent did)
4. Restore to snapshot (clean state for next run)

**Что это меняет в Wolf:**
- Для CLI-агента без VM мы можем использовать **git worktree** как snapshot mechanism (уже есть в Wolf: `.worktrees/<имя-задачи>`).
- Перед sandbox evaluation создаём worktree с seeded данными, запускаем агента, читаем trace, удаляем worktree.

---

## 3. Синтез: lightweight sandbox для Wolf (без Docker/gVisor)

### 3.1. Четыре паттерна для Ф23

| Pattern | Источник | Механика | Применимость в Wolf |
|---------|----------|----------|---------------------|
| **1. Virtual FS + intercept** | Convex Sandbox | just-bash + memfs + intercept Node fs APIs | ✅ Mock filesystem для replay |
| **2. VCR (record/replay)** | Augment/cagent | Cassette captures API calls, replay with zero network | ✅ Replay исторических сессий |
| **3. Determinism pinning** | Augment | Explicit seeds, sorted listings, fixed env vars | ✅ Воспроизводимость sandbox evaluation |
| **4. Snapshot/restore** | Fly.io | Snapshot filesystem before run, restore after | ✅ Git worktree как snapshot |

### 3.2. Рекомендуемая архитектура sandbox для Wolf

**Цель:** Validate draft-rule перед активацией (Фаза 23 STOP-гейт).

**Компоненты:**

1. **Virtual filesystem (memfs):**
   - In-memory filesystem для mock окружения
   - Seeded данными из сигнального лога (исторические стимул-промпты)
   - Intercept Node fs APIs для recording изменений

2. **VCR cassette:**
   - Запись всех LLM API calls во время нормальной работы
   - Replay из cassette для sandbox evaluation (zero network calls, millisecond latency)
   - Normalize tool call IDs для stable matching

3. **Determinism guarantees:**
   - `random.seed(42)`, `process.env.PYTHONHASHSEED=0`
   - `sorted(directory listings)`
   - Fixed timezone (UTC), locale (C)

4. **Resource limits:**
   - Wall-clock timeout (например, 30 секунд на replay)
   - PID limit (prevent fork bombs)
   - Memory limit (если используем child process)

5. **Git worktree как snapshot:**
   - Перед sandbox: `git worktree add .worktrees/sandbox-<id>`
   - Seed worktree данными из сигнального лога
   - Запустить агента в worktree
   - Прочитать trace (что агент сделал)
   - `git worktree remove .worktrees/sandbox-<id>` (cleanup)

### 3.3. Калибровка порога 0.6 (hard negative) на наших сигналах

**Проблема:** В Co-Evolving Agents [[10]] порог 0.6 определён в DPO-домене (reward 0..1). У нас нет явного reward, но есть:
- Вердикты: accepted / rejected
- Rejected-циклы: количество итераций
- FRICTION: tool errors, worker count, duration
- Weighted tokens

**Предложение — composite score:**

```
score = α × verdict_score + β × friction_score + γ × efficiency_score
```

где:
- **verdict_score:** 1.0 если accepted, 0.0 если rejected
- **friction_score:** 1.0 - normalized(FRICTION) (меньше ошибок → выше score)
- **efficiency_score:** 1.0 - normalized(weighted_tokens) (меньше токенов → выше score)
- **α, β, γ:** веса (например, 0.5, 0.3, 0.2)

**Порог hard negative:** score ≥ 0.6 (аналог Co-Evolving Agents)

**Интерпретация:**
- **score ≥ 0.6:** near-success failure (structured decision process, minimal FRICTION) → hard negative, сохранить как constraint
- **score < 0.6:** shallow failure (trivial mistake) → малоинформативен, отбросить

**Калибровка:** На реальных данных из сигнального лога (Фаза 20) подобрать α, β, γ так, чтобы:
- ~25% rejected-циклов попадали в hard negatives (соответствует Co-Evolving Agents: 25.0% hard negatives vs 22.7% baseline)
- Hard negatives были семантически осмысленными (structured decision process)

---

## 4. Что это меняет в Wolf (итоговая таблица)

| Фаза | Механизм | Источник | Предлагаемое изменение в спеке |
|------|----------|----------|-------------------------------|
| **Ф22 (ExpeL)** | Governed candidate lifecycle | Proofs Not Promises | Добавить lifecycle draft-rule: bounded artifact → Cassius challenge (adversarial test) → sandbox-only → held-out evaluation → gated approval |
| **Ф22 (ExpeL)** | Honest unfavorable outcomes | Proofs Not Promises | В сигнальном логе фиксировать не только success rates, но и regression rates (correct-controlaction falls, stress regression exceeds baseline) |
| **Ф23 (STOP-гейт)** | Simulator-grounded evaluation | PACE-Bench | Sandbox возвращает структурированный feedback (v, s, d): constraints satisfied, task score, diagnostic report. Не просто pass/fail. |
| **Ф23 (STOP-гейт)** | Memory anchoring danger | PACE-Bench | Draft-rule в статусе `draft` до sandbox validation. Только после прохождения sandbox → `accepted`. Иначе memory anchors to suboptimal solutions. |
| **Ф23 (STOP-гейт)** | VCR pattern (record/replay) | Augment/cagent | Записывать cassette.yaml во время нормальной работы. Для sandbox evaluation replay из cassette (zero network calls, millisecond latency). |
| **Ф23 (STOP-гейт)** | Determinism guarantees | Augment | Для воспроизводимости sandbox: explicit seeds, sorted directory listings, fixed env vars (PYTHONHASHSEED, TZ, LC_ALL). |
| **Ф23 (STOP-гейт)** | Lightweight sandbox (no Docker) | Convex Sandbox | In-memory virtual filesystem (memfs) + intercept Node fs APIs + git worktree как snapshot/restore. |
| **Ф22 (ExpeL)** | Hard negative threshold 0.6 | Co-Evolving Agents + калибровка | Composite score = α×verdict + β×friction + γ×efficiency. Порог 0.6 для hard negatives. Калибровать α,β,γ на реальных данных. |

---

## 5. Источники

[[1]] Mazzocchetti, Adam. «Proofs, Not Promises: Governed Candidate Improvement for Agent Control Runtimes» (May 23, 2026). SSRN: https://ssrn.com/abstract=6835839. DOI: 10.2139/ssrn.6835839.

[[2]] Mazzocchetti, Adam. «Proofs, Not Promises: Governed Candidate Improvement for Agent Control Runtimes» (May 2026). Zenodo: https://zenodo.org/records/20405355. DOI: 10.5281/zenodo.20405355.

[[3]] CyberQube1/Proofs_Not_Promises_Public_Evidence_Repo. GitHub: https://github.com/CyberQube1/Proofs_Not_Promises_Public_Evidence_Repo.

[[4]] Zhan, Yuhao et al. «PACE-Bench: Benchmarking Physics Adaptation via Code Evolution in Dynamic Environments» (August 14, 2026). arXiv:2608.14441. URL: https://arxiv.org/abs/2608.14441.

[[5]] Cann, Mike. «How to Give AI Agents a Bash Terminal Without Docker or VMs». Convex Stack (2026). URL: https://stack.convex.dev/convex-sandbox-persistent-bash-environment.

[[6]] wantpinow/convex-sandbox. GitHub: https://github.com/wantpinow/convex-sandbox.

[[7]] nicolo-ribaudo/just-bash. GitHub: https://github.com/nicolo-ribaudo/just-bash.

[[8]] Shah, Molisha. «What Is an Agent Execution Sandbox?». Augment Code Guides (2026). URL: https://www.augmentcode.com/guides/agent-execution-sandbox.

[[9]] Fly.io. «Agent Sandboxes: Isolated Runtimes for Testing AI Agent Behavior». URL: https://fly.io/learn/agent-sandbox/.

[[10]] Barke, Shraddha et al. «Co-Evolving Agents: Learning from Failures as Hard Negatives» (November 2025, updated v4 2026). arXiv:2511.22254. URL: https://arxiv.org/abs/2511.22254. (Из expert-003)

---

## 6. Следующие шаги

**Готов к expert-005-decay-ttl.md** (Q26.1–Q26.2):
- Механика retention score MaRS (формула, веса, политики)
- Конкретные TTL: fixed vs adaptive, от чего зависит
- Проблемы decay в Generative Agents
- Что это меняет в Wolf (Фаза 26)

**Потом:**
- expert-006-clustering-traces.md (Q21.1–Q21.2)
- expert-007-logging-standards.md (Q20.1–Q20.2)
- expert-008-negative-constraints.md (Q22.3 + калибровка 0.6 детали)
- expert-009-013 (остальные Q из wolf-003)

---

**Резюме для агента:** Файл готов к интеграции. Три замечания из wolf-004 закрыты: (1) Proofs Not Promises верифицирован через SSRN+Zenodo+GitHub, (2) PACE-Bench связь с sandbox доказана через "diagnostic sandbox feedback", (3) порог 0.6 адаптирован через composite score (verdict+friction+efficiency). Ключевые паттерны для Ф23: governed candidate lifecycle, simulator-grounded evaluation, VCR replay, determinism pinning, lightweight sandbox (memfs+intercept+worktree). Следующий файл — expert-005 (decay/TTL).

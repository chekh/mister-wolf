# expert-005: Decay & TTL — механизмы забывания памяти (Q26.1–Q26.2)

> От: внешний эксперт (ВА)
> Кому: агенту-координатору Mr.Wolf
> Дата: 2026-08-28
> Вопросы программы: Q26.1 (триггер переоценки Фазы 26: деградация recall trigger_keywords), Q26.2 (TTL-политики: фиксированные против адаптивных, механизм `last_triggered_at`)
> Мелочи из вердикта по expert-004 учтены: примеры кода — на TypeScript/Node. Глоссарий «Proofs, Not Promises» и разбор несоответствия автора Convex-статьи — в expert-008.

---

## 0. Резюме порции

Главная находка: **работа Microsoft «Human-Inspired Memory Architecture for LLM Agents» (arXiv:2605.08538, май 2026)** — единственный известный ВА источник, дающий эмпирически калиброванные числа забывания именно для **продакшн-агентов в домене разработки ПО** (датасет: 13K issues VSCode, 120K событий). Три ключевых числа:

1. **λ = 0.001 → период полураспада ≈ 29 дней** для importance-score несолидированных событий — с явным выводом: «продакшн-агентам нужны более долгие горизонты памяти, чем человеческой биологии» [[2605.08538, §9.1]].
2. **Консолидация = дедупликация, не суммаризация**: агрессивная кластеризация с мержем роняет accuracy с 78.4% до 48.4%; дедуп-консолидация статистически неразрушающа [[2605.08538, §9.2]].
3. **Контринтуитивный результат калибровки**: recency как предиктор важности почти бесполезен (AUC=0.51, вес 0.019), доминируют content length (AUC=0.77) и surprise [[2605.08538, §8.1]]. Это прямое предупреждение против ставки на чистый time-based TTL без подкрепления важностью.

Для Wolf это означает: **фиксированный TTL допустим как v1-дефолт, но правильная целевая архитектура — «важность × доступ» (Ebbinghaus-реинфорсмент), а не «возраст»**. Механизм `last_triggered_at` из Фазы 16 — готовый носитель для этого.

---

## 1. Пошаговый разбор источников

### 1.1. Human-Inspired Memory Architecture (Microsoft, arXiv:2605.08538, 08.05.2026)

Авторы: Kerestecioglu, Robsky, Vasters, Sharma, Kesselman (Microsoft). Preprint (не peer-reviewed на дату разбора — помечено).

**Шесть когнитивных механизмов**, каждый против конкретного режима отказа наивного накопления памяти:

| Механизм | Биологический прототип | Системная реализация |
|---|---|---|
| Консолидация | Sleep-phase integration | Batch-обработка (дефолт: каждые 6 часов), дедуп + мерж |
| Забывание | Decay + interference | TTL-expiration + interference scoring |
| Матурация | Engram stabilization | «Тихие» семантические записи с ростом активации |
| Реконсолидация | Memory lability on retrieval | Окно модифицируемости (дефолт: 60 минут) |
| Граф знаний | Semantic networks | Entity knowledge graph |
| Гибридный поиск | Multi-cue recall | Episodic + semantic pathways |

**Трёхуровневое хранение с TTL** — прямая модель для Фазы 26:

> «short-term (prefrontal cortex → hot cache, in-memory with TTL min–hrs), medium-term (hippocampus → warm episodic store, full fidelity with TTL days–weeks), and long-term (neocortex → knowledge graph, semantic and permanent)» [[2605.08538, §3]]

**Формула пассивного затухания** (для событий, ожидающих консолидации):

> «I(t) = I₀ · e^(−λt), where λ is the decay rate (empirically optimized: λ=0.001, corresponding to a half-life of ≈29 days) and t is hours since encoding» [[2605.08538, §5]]

**Interference-based forgetting** — то, чего нет в чистом TTL:

> «I_interference = Σⱼ wⱼ · sim(mᵢ, mⱼ), where wⱼ represents interference weights (retroactive = 0.6, proactive = 0.4), reflecting the finding that new learning more strongly disrupts old memories» [[2605.08538, §5]]

**Graceful degradation — 6 уровней верности** (вместо бинарного «удалить/оставить»):

> «memories undergo progressive fidelity reduction through six levels starting from full episodic record (L0, 100%) through summary (L2, 50%) and gist (L3, 25%) to a tombstone record (L5, 0%) that preserves only the fact that a memory existed. Degradation is triggered by age combined with memory score, not storage economics» [[2605.08538, §5]]

**Scoring важности** (5 факторов, дефолтные веса):

| Фактор | Вес | Что считает |
|---|---|---|
| Recency | 0.25 | экспоненциальное затухание от таймстампа |
| Frequency | 0.25 | обратная частота похожих событий |
| Bayesian Surprise | 0.20 | отклонение от априорного распределения |
| Entity Salience | 0.15 | макс. важность упомянутых сущностей |
| Outcome | 0.15 | сигнал достижения цели |

Классификация по композитному скору: **top 20% → promote, middle 60% → retain, bottom 20% → prune** [[2605.08538, §4]].

**Эмпирика (датасет разработки ПО — профильный для Wolf):**

> «Consolidation and forgetting achieve 97.2% retention precision with 58% store reduction, a +21.8 percentage point improvement over the keep-everything baseline (75.4%)... The memory store self-regulates at 300–500 events regardless of input volume» [[2605.08538, §9.1]]

Ключевой вывод по горизонту памяти:

> «Optimal decay rate is λ=0.001 (half-life ≈ 29 days), indicating production agents need longer memory horizons than human biology, suggesting half-life relates to the rhythm of the domain rather than daily cycles» [[2605.08538, §9.1, Key findings]]

**Результат синтетической калибровки, ломающий интуицию** (пороги выведены на синтетике, без подглядывания в бенчмарк — методология «synthetic calibration», §8.1):

> «content length (AUC=0.77, weight=0.363) and turn position (weight=0.325) dominate while recency (AUC=0.51, weight=0.019) provides negligible discrimination» [[2605.08538, §8.1]]

**Деструктивность агрессивного забывания:**

> «Agglomerative clustering with merge reduces accuracy to 48.4% [44.0, 52.8], as merging turns into cluster summaries destroys the specific details needed for factual question answering. This confirms that consolidation should deduplicate, not summarize» [[2605.08538, §9.2, Analysis]]

> «Aggressive token budgets (25K, 50K) are statistically distinct from raw RAG and confirm that under-budgeting destroys factual recall, particularly for single-session questions where the relevant turn is irreversibly removed» [[2605.08538, §9.3]]

**Что это меняет в Wolf:**
- Появляется **эмпирически обоснованный дефолт периода полураспада: ~29 дней** для эпизодических объектов (не 30-90 дней произвольно, а из профильного домена).
- Фиксируется правило: **деградация памяти — через дедупликацию и снижение верности, никогда через суммаризацию** (защита от потери деталей, критичных для rule/decision).
- Сигнальный лог (Фаза 20) получает новый тип сигнала: `consolidation_action` (promote/retain/prune) — для будущей калибровки собственных весов.

### 1.2. Generative Agents (Park et al., UIST 2023, arXiv:2304.03442)

Классика. Формула ретривала:

> «The retrieval function scores all memories as a weighted combination of the three elements: score = α_recency · recency + α_importance · importance + α_relevance · relevance» [[2304.03442, §4.1]]

Конкретное число затухания (первоисточник):

> «Our decay factor is 0.995» [[2304.03442, §4.1; цитируется в 7470+ работах]]

Расшифровка: **γ = 0.995 на игровой час**. Вторичный источник уточняет:

> «recency = γ^(hours since last access), with γ = 0.995... memories not touched in a long time gradually lose retrieval priority» [memx.app/glossary/generative-agents]

Производные числа (арифметика ВА из цитированного γ, не из бумаги):
- за 24 часа: 0.995^24 ≈ 0.887
- за 7 дней: 0.995^168 ≈ 0.431
- период полураспада: ≈138 часов ≈ **5.8 дня**

**Важно:** это игровой-временной масштаб симуляции поведения, а не рабочий цикл разработчика. Прямой перенос γ=0.995/час в Wolf дал бы полураспад ~6 дней — в 5 раз агрессивнее, чем профильный результат Microsoft (29 дней). Использовать как иллюстрацию механики, не как дефолт.

**Что это меняет в Wolf:**
- Подтверждена сама схема «затухание от последнего доступа, а не от создания» — `last_triggered_at` семантически корректнее `created_at` как якорь затухания.

### 1.3. MemoryBank (Zhong et al., AAAI 2024, arXiv:2305.10250)

Механизм забывания по кривой Эббингауза:

> «MemoryBank incorporates a memory updating mechanism, inspired by the Ebbinghaus Forgetting Curve theory, which permits the AI to forget and reinforce memory based on time elapsed and the relative significance of the memory» [[2305.10250, abstract]]

Ключевое свойство: **доступ укрепляет память** (reinforce on recall) — сила памяти растёт при каждом успешном извлечении, кривая забывания сдвигается.

Критика одномерности (вторичный источник, 2026):

> «MemoryBank introduces the Ebbinghaus Forgetting Curve, but the quantification of its memory value mainly depends on time decay and recall frequency, which is a simplified one-dimensional method» [dl.acm.org/doi/full/10.1145/3803291.3803294]

**Что это меняет в Wolf:**
- Ebbinghaus-реинфорсмент — обоснование механики «доставка продлевает жизнь»: каждый сработавший `trigger_keywords` матчинг должен обновлять `last_triggered_at` И поднимать вес объекта. Это превращает TTL из гильотины в адаптивную политику без усложнения.

### 1.4. A-MEM (Xu et al., arXiv:2502.12110, февраль 2025 — фактическая тема Фазы 26)

Структура ноты памяти:

> «mᵢ = {cᵢ, tᵢ, Kᵢ, Gᵢ, Xᵢ, eᵢ, Lᵢ}, where cᵢ represents the original interaction content, tᵢ is the timestamp, Kᵢ denotes LLM-generated keywords, Gᵢ contains LLM-generated tags, Xᵢ represents the LLM-generated contextual description, and Lᵢ maintains the set of linked memories» [[2502.12110, §3.1]]

**Механика Link Generation** (шаги):
1. Для новой ноты считается эмбеддинг eₙ.
2. Cosine similarity со всеми существующими: `sₙ,ⱼ = (eₙ·eⱼ)/(‖eₙ‖‖eⱼ‖)`.
3. Берётся top-k ближайших (в экспериментах **k=10** дефолт; 40–50 для GPT-моделей на отдельных категориях [[2502.12110, B.4]]).
4. LLM решает, какие связи реально установить (не все кандидаты становятся связями).

**Механика Memory Evolution** — главное отличие от статичных графов:

> «After creating links for the new memory, A-Mem evolves the retrieved memories based on their textual information and relationships with the new memory... mⱼ* ← LLM(mₙ ‖ M_near^n ∖ mⱼ ‖ mⱼ ‖ P_s3). The evolved memory mⱼ* then replaces the original memory mⱼ» [[2502.12110, §3.3]]

Действия эволюции из промпт-шаблона (приложение C.3): **`strengthen`, `merge`, `prune`** + обновление тегов и контекстов соседей.

**Эмпирика (бенчмарк LoCoMo):**

- Токен-эффективность: A-MEM использует **1,200–2,500 токенов против 16,900** у LoCoMo/MemGPT (~7–14× экономия) [[2502.12110, B.2]].
- Multi-hop на GPT-4o-mini: A-MEM F1 = **45.85 против 18.41** (чистый контекст) и 25.52 (MemGPT) — более чем 2× [[2502.12110, Table 1]].
- Абляция (тот же бенчмарк, multi-hop F1): без Link Generation и Memory Evolution — 24.55; без одного Memory Evolution — 31.24; полный A-MEM — 45.85 [[2502.12110, Table 2]]. Вывод: оба модуля вносят вклад, эволюция — больший.

**Что это меняет в Wolf:**
- Для Фазы 26 конкретизируется состав: **не «перестроить граф», а два модуля — Link Generation + Memory Evolution** с действиями strengthen/merge/prune.
- Инфраструктура Wolf уже покрывает половину: `wolf relation add` (16 предикатов, Phase 17) = готовый слой связей; `trigger_keywords` (Phase 16) = Kᵢ; governance/lifecycle = контроль того, что эволюция не трогает `canonical`-объекты без гейта.
- Зависимость, которой нет у Wolf сегодня: эмбеддинги для similarity-фильтра (шаг 2). Локальный вариант — `all-minilm-l6-v2` (использован в A-MEM [[2502.12110, §4.2]]) или LLM-парный матчинг через адаптер `opencode run` без эмбеддингов (дороже, но сохраняет local-first без новой зависимости).

### 1.5. Forgetful but Faithful / MaRS (Alqithami, arXiv:2512.12856, декабрь 2025)

Разобран в expert-003 (формула retention score `score(i) = (Ûᵢ − λ_priv·sᵢ)/wᵢ`, политики удаления, метрики FiFA). Дельта для этой порции одна — **бюджетный принцип** как альтернатива календарному:

> «τ_thr chosen so that Σ wn ≤ B» (удаление по временному окну выбирается так, чтобы суммарный вес оставшихся объектов укладывался в токен-бюджет B) [[2512.12856, §4]]

**Что это меняет в Wolf:** для `wolf recap`/`wolf call --for` (инжекты в контекст) бюджетный критерий актуальнее календарного: не «старше 90 дней», а «суммарный вес доставляемого не превышает X токенов; при превышении вытесняем с минимальным score». Календарный TTL остаётся защитой от разрастания хранилища, бюджетный — от раздувания контекста сессии. Это два разных механизма, спека их пока не различает.

---

## 2. Q26.1 — Триггер переоценки Фазы 26: измерение деградации recall

### 2.1. Определение из роадмапа (напоминание)

Фаза 26 активируется при: «деградация recall `trigger_keywords` по метрикам Phase 20 — полезный урок не доставляется в сессию с совпавшей темой (паттерн N≥3 таких пропусков)».

### 2.2. Что конкретно измерять (механика, шаг за шагом)

Сигнальный лог (Фаза 20) фиксирует на каждый `wolf call --for <тема>` и на каждую доставку автостарт-плагином:

```typescript
// Тип записи delivery_event в signals.jsonl
interface DeliveryEvent {
  timestamp: string;          // ISO 8601
  topic: string;              // тема запроса (нормализованная)
  delivered_ids: string[];    // ID доставленных lesson/rule
  matched_keywords: string[]; // какие trigger_keywords сработали
  outcome: 'used' | 'ignored' | 'unknown'; // см. 2.3
}
```

**Пропуск (miss)** определяется по двум каналам — оба уже существуют в инфраструктуре:

1. **Явный пропуск поиска:** `wolf search`/`wolf call` по теме вернул активный `lesson`/`rule` с `trigger_keywords`, но матчинг не сработал (объект не доставлен). Детерминированный подсчёт.
2. **Семантический пропуск:** сессия завершилась с `FRICTION`/`rejected-циклом`, и пост-фактум анализ (тот же детектор паттернов Фазы 21) нашёл активный урок, чьи `trigger_keywords` **не пересеклись** с формулировкой темы, хотя по смыслу урок релевантен. Этот канал требует одного вызова адаптера `opencode run` на сессию с пропусками — опционально, не в горячем пути.

### 2.3. Проблема исхода «использовано ли доставленное»

Доставка ≠ применение. Чтобы отличить работающие правила от мёртвых, нужен исход. **Детерминированные варианты без LLM** (по приоритету):

- **Правило с критерием проверки**: если `rule` содержит исполняемый критерий (например, «не использовать команду X»), исход = нарушение критерия в сессии (grep по логу сессии). Это Φ_metric из survey, разобранного в expert-003.
- **Прокси-сигнал**: доставленный урок + отсутствие повторного `FRICTION` того же класса = `used`; повтор того же класса = `ignored`. Работает только при ключах однотипности из Фазы 21.
- **Явная разметка куратором** (минимально инвазивно): в батч-дайджесте (механизм из эксперта-003, §5) одна строка на доставленное правило: «помогло / не помогло / не знаю».

### 2.4. Формула и порог активации

Для окна наблюдения W (предложение ВА: скользящие 30 дней — согласуется с 29-дневным полураспадом из §1.1):

```
recall_delivery(W) = 1 − misses(W) / expected_deliveries(W)
```

где `expected_deliveries` = число сессий, тема которых совпала с `trigger_keywords` хотя бы одного активного объекта (по каналу 1); `misses` = сессии, где совпадение было, но объект не доставлен или доставлен и проигнорирован (канал 2, опционально).

**Порог активации Фазы 26** (предложение ВА, требует калибровки):
- **Абсолютный:** `recall_delivery < 0.8` при `expected_deliveries ≥ 20` (иначе шум).
- **Паттернный (из роадмапа):** конкретный урок недоставлен в ≥3 релевантных сессиях подряд — локальный триггер «пересмотреть `trigger_keywords` этого урока», не всей Фазы 26.

Важная тонкость из литературы: падение recall может означать не деградацию доставки, а **устаревание знания** (урок перестал быть полезным). Поэтому активация Фазы 26 должна предваряться проверкой: `ignored`-события преобладают над `недоставленными`? Если да — это триггер не на A-MEM-связность, а на decay/supersede (§3 ниже).

### 2.5. Что это меняет в Wolf

- **Фаза 20 получает третий тип сигнала** (к rejected-циклам и тул-ошибкам): `delivery_event`. Схема выше.
- **Фаза 21 получает ключ однотипности для пропусков**: тема + объект + причина (недоставлен / доставлен-и-проигнорирован).
- **Фаза 26 получает формализованный вход**: не «кажется, что доставка ухудшилась», а число `recall_delivery` и его разложение.
- В роадмапе Фазы 26 триггер описан как N≥3 пропусков — после этой порции рекомендуется оставить паттернный порог для локальных правок `trigger_keywords`, а системную активацию привязать к `recall_delivery < 0.8` (оба порога — предложения ВА).

---

## 3. Q26.2 — TTL-политики: фиксированные против адаптивных

### 3.1. Спектр решений из литературы

| Система | Политика | Числа | Источник |
|---|---|---|---|
| Human-Inspired (Microsoft) | Экспоненц. затухание важности + TTL-тиры + interference | λ=0.001 → T½≈29 дней; тиры: мин-часы / дни-недели / перманентно | [[2605.08538, §3, §5]] |
| Generative Agents | Экспоненц. затухание от последнего доступа | γ=0.995/час → T½≈5.8 дня | [[2304.03442, §4.1]] |
| MemoryBank | Ebbinghaus + реинфорсмент при доступе | сила памяти растёт от извлечений | [[2305.10250, abstract]] |
| MaRS (Forgetful but Faithful) | Retention score + токен-бюджет | формула в expert-003 §2.2 | [[2512.12856, §4]] |
| MemGPT/Letta | Pressure-based eviction (по заполнению контекста) | `on_memory_pressure` → суммаризация + `evict_oldest()` | [memx.app/glossary/memgpt] |

### 3.2. Вывод по оси «фиксированный против адаптивного»

Литература не спорит «или/или» — она даёт **двухступенчатую схему**:

1. **Фиксированный максимум (жёсткий потолок возраста)** — защищает от неограниченного роста. Все системы его имеют (тиры с явным «max age»).
2. **Адаптивный скоринг внутри потолка** — решает, что именно вытесняется при давлении (бюджет, interference, важность).

Чистый фиксированный TTL без учёта важности — самая слабая схема: результат калибровки Microsoft показывает, что возраст сам по себе плохой предиктор ценности (AUC=0.51 ≈ случайность) [[2605.08538, §8.1]].

### 3.3. Конкретные числа для Wolf (классификация)

**Подтверждённые цитатой (переносятся как обоснование):**
- Полураспад важности ~29 дней для продакшн-агентов: λ=0.001 [[2605.08538, §5, §9.1]].
- Интерференционные веса: новое мешает старому сильнее (0.6 против 0.4) [[2605.08538, §5]] → при конфликте правил вытесняется старое.
- Классификация 20/60/20 (promote/retain/prune) [[2605.08538, §4]].
- 6 уровней деградации верности, нижний — tombstone («память о том, что память была») [[2605.08538, §5]].

**Предложения ВА (дефолты с обязательной калибровкой):**

| Тип объекта | Жёсткий максимум (возраст от `last_triggered_at`) | Обоснование |
|---|---|---|
| `session-summary`, `report` | 30 дней | эпизодика; согласуется с T½ 29 дней |
| `lesson` | 90 дней без доставки → `review_required` | среднесрочный; 3× полураспад ≈ 6% остаточного веса |
| `rule` | 180 дней без доставки → `review_required` | правила дороже в производстве и проверке |
| `decision` | бессрочно (не удаляется; только `supersede`) | governance: источник истины |
| `debug`, `observation` | 30 дней | эпизодика |

Критически: **время считается от `last_triggered_at`, не от `created_at`** (Ebbinghaus-реинфорсмент из §1.3). Правило, которое доставляется каждую неделю, не стареет.

### 3.4. Механизм `last_triggered_at` (куда встроить)

Точки обновления (все существуют):
1. **Доставка через `get-call-injections`** (Phase 16) — матчинг сработал → обновить `last_triggered_at` и счётчик `delivery_count`.
2. **Автостарт-плагин** (Phase 15) — объект попал в `wolf recap` вывод → обновить.
3. **`wolf search` с попаданием в результат** — спорный момент: обновление при любом поиске размывает сигнал; предложение ВА — не обновлять, только при доставке в сессию.

Хранение: **не в markdown-объектах** (иначе каждое обновление трогает canonical-файл и шумит в git). Предложение ВА — отдельный `derived`-файл `.wolf/delivery-stats.json` (статус «производное, как SQLite-индекс»): `{ object_id: { last_triggered_at, delivery_count, used_count, ignored_count } }`. Canonical-память остаётся неизменной; статистика пересобираема из `signals.jsonl`.

### 3.5. Graceful degradation для Wolf (уровни верности)

Маппинг шести уровней из §1.1 на существующие механизмы:

| Уровень | Что происходит | Механизм Wolf |
|---|---|---|
| L0 (100%) | Объект активен, доставляется | статус `active` |
| L1–L2 | Уменьшение веса в доставке | скоринг в `get-call-injections` (новый, детерминированный) |
| L3 (gist) | Краткая версия вместо полной | автопатч: тело ужимается при переходе в `review_required` — только через гейт |
| L5 (tombstone) | «Здесь было правило X, заменено/устарело» | **уже есть**: `superseded_by` + `archived` статус |

Бинарного удаления в Wolf не появляется вообще: история = `events.jsonl` + `supersede`-цепочки. Забывание в терминах доставки ≠ удаление из хранилища — это главное расхождение с наивным TTL, и оно уже заложено в архитектуре.

### 3.6. Что это меняет в Wolf

- **Спека Фазы 26** получает двухканальную модель: (а) календарный потолок от `last_triggered_at`; (б) скоринг доставки. Плюс явное правило: деградация через верность, не через удаление.
- **Сигнальный лог (Фаза 20)** расширяется `delivery_event` и `delivery_stats`.
- **`get-call-injections` (Phase 16)** получает детерминированный вес: `weight = f(важность_типа, delivery_count, возраст_от_last_triggered)` — без LLM.
- **Куратор получает новый пункт в батч-дайджесте**: объекты в `review_required` (истёк потолок без доставок) с выбором «продлить / архивировать / переписать».

---

## 4. Кандидаты правок спеки (накопительно, к диспетчу ревизии)

1. **Фаза 20:** добавить тип сигнала `delivery_event` (схема §2.2) и производный файл `delivery-stats.json` (§3.4).
2. **Фаза 26, триггер:** формализовать `recall_delivery < 0.8` при `expected_deliveries ≥ 20` + ветвление «пропуск доставки» против «устаревание знания» (§2.4).
3. **Фаза 26, состав:** зафиксировать два модуля A-MEM (Link Generation + Memory Evolution, действия strengthen/merge/prune) вместо общей формулировки «динамическая связность» (§1.4).
4. **Фаза 16:** матчинг обязан обновлять `last_triggered_at`/`delivery_count`; время жизни считать от него (§3.3–3.4).
5. **Общее правило деградации:** дедупликация и снижение верности; суммаризация как замена оригинала запрещена для `rule`/`decision`/`lesson` (§1.1, цитата про 48.4%).
6. **Таксономия:** дефолтные потолки возраста по типам (§3.3) — вынести в `.wolf/config.yaml` как поля типа `retention.max_idle_days` (класс «параметры», автономно настраиваемый по автономии B).

## 5. Ограничения порции (честно)

- **2605.08538 — preprint** (не рецензирован на дату разбора). Числа λ и тиры даны авторами как «empirically optimized», методология калибровки (синтетика, без бенчмарк-утечки) выглядит строгой, но воспроизведения пока нет.
- **2512.12856 (MaRS)** — конкретные значения λ_age/τ_thr/α/β/γ в статье НЕ опубликованы (зафиксировано ещё в expert-003 §2.5). Все конкретные пороги выше — либо из 2605.08538, либо предложения ВА.
- **Генератив-агентские γ=0.995** подтверждены цитатой, но домен (игровая симуляция) далёк от кодинг-агента; перенос только как иллюстрация механики.
- Эмпирика A-MEM собрана на диалоговом LoCoMo, не на кодинг-задачах; токен-эффективность переносится как порядок величины, не как гарантия.

## 6. Источники

1. **Human-Inspired Memory Architecture for LLM Agents** — Kerestecioglu D., Robsky A., Vasters C., Sharma A., Kesselman Y. (Microsoft). arXiv:2605.08538v1 [cs.AI], 08.05.2026. URL: https://arxiv.org/abs/2605.08538 (HTML: https://arxiv.org/html/2605.08538v1). Статус: preprint. Цитаты: §3 (тиры), §4 (скоринг, 20/60/20), §5 (формулы затухания/интерференции/деградации), §8.1 (синтетическая калибровка, AUC), §9.1 (λ=0.001, 97.2%/58%), §9.2–9.3 (деструктивность агрессии).
2. **Generative Agents: Interactive Simulacra of Human Behavior** — Park J.S., O'Brien J.C., Cai C.J., Morris M.R., Liang P., Bernstein M.S. UIST 2023 (peer-reviewed). arXiv:2304.03442. URL: https://arxiv.org/abs/2304.03442. Цитата «Our decay factor is 0.995»: §4.1; подтверждение: https://dl.acm.org/doi/fullHtml/10.1145/3586183.3606763; разбор γ: https://memx.app/glossary/generative-agents. Производные числа (полураспад 5.8 дня) — арифметика ВА.
3. **MemoryBank: Enhancing Large Language Models with Long-Term Memory** — Zhong W. et al. AAAI 2024 (peer-reviewed). arXiv:2305.10250. URL: https://arxiv.org/abs/2305.10250; https://ojs.aaai.org/index.php/AAAI/article/view/29946. Цитата про Ebbinghaus/forget/reinforce: abstract. Критика одномерности: https://dl.acm.org/doi/full/10.1145/3803291.3803294.
4. **A-Mem: Agentic Memory for LLM Agents** — Xu W., Liang Z., Mei K., Gao H., Tan J., Zhang Y. arXiv:2502.12110 (NeurIPS 2025). URL: https://arxiv.org/abs/2502.12110 (HTML: https://arxiv.org/html/2502.12110v2). Цитаты: §3.1 (структура ноты), §3.2 (link generation), §3.3 (memory evolution), Table 1–2 (LoCoMo, абляция), §4.2/B.4 (k=10, minilm).
5. **Forgetful but Faithful: A Cognitive Memory Architecture and Benchmark for Privacy-Aware Generative Agents (MaRS)** — Alqithami S. arXiv:2512.12856, декабрь 2025. Разобран в expert-003 §2; здесь — только бюджетный принцип τ_thr (§4).
6. **MemGPT: Towards LLMs as Operating Systems** — Packer C. et al. NeurIPS 2024. arXiv:2310.08560. Механизм `on_memory_pressure`: https://memx.app/glossary/memgpt/ (вторичный разбор с псевдокодом), первоисточник: https://arxiv.org/pdf/2310.08560.
7. **LongMemEval: Benchmarking Chat Assistants on Long-Term Interactive Memory** — Wu D. et al. ICLR 2025. Используется как бенчмарк в [1]; упоминается для контекста метрик.

---

**Следующий файл:** `expert-006-clustering-traces.md` (Q21.x — ключи однотипности сигналов, кластеризация без тяжёлых эмбеддингов) либо по указанию диспетчера.

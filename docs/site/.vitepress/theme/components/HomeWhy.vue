<script setup lang="ts">
import { computed } from 'vue'
import { useData, withBase } from 'vitepress'

type L = { en: string; ru: string }

const { lang } = useData()
// Reactive: `lang` changes on client-side locale navigation (no reload);
// a plain boolean would freeze the first-loaded locale.
const ru = computed(() => lang.value.startsWith('ru'))
const t = (s: L): string => (ru.value ? s.ru : s.en)

// Named bilingual fields: index-proof for both locales; `response` is the
// Wolf answer column. RU table has no # column (numbering is EN-only).
type Row = { id: string; problem: L; symptom: L; response: L }
const rows: Row[] = [
  {
    id: 'P1',
    problem: { en: 'Context is lost between sessions', ru: 'Контекст теряется между сессиями' },
    symptom: { en: 'the agent starts from scratch', ru: 'агент начинает с нуля' },
    response: {
      en: 'wolf call — cold start with active rules and lessons',
      ru: 'wolf call — холодный старт с актуальными правилами и уроками',
    },
  },
  {
    id: 'P2',
    problem: { en: 'Experience is not reused', ru: 'Опыт не переиспользуется' },
    symptom: {
      en: 'recurring tasks are solved from scratch: prose reasoning + new one-off scripts',
      ru: 'повторные задачи решаются заново',
    },
    response: {
      en: 'solve packs and memory search — a recurring task starts from ready context',
      ru: 'solve pack и поиск по памяти — повторная задача начинается с готового контекста',
    },
  },
  {
    id: 'P3',
    problem: { en: 'Project documents live apart from agents', ru: 'Документы живут отдельно от агентов' },
    symptom: { en: 'no single source of truth', ru: 'единой точки правды нет' },
    response: {
      en: 'bootstrap registers project documents in memory',
      ru: 'bootstrap регистрирует документы проекта в памяти',
    },
  },
  {
    id: 'P4',
    problem: { en: 'Accumulated knowledge becomes noise', ru: 'Накопленное становится шумом' },
    symptom: { en: 'memory grows, value drops', ru: 'память растёт, ценность падает' },
    response: {
      en: 'typed lifecycle statuses and supersede chains — knowledge goes stale explicitly',
      ru: 'типизация, статусы жизненного цикла и supersede-цепочки — знание устаревает явным образом',
    },
  },
  {
    id: 'P7',
    problem: { en: 'One agent thinks and checks itself', ru: 'Один агент думает и проверяет сам себя' },
    symptom: { en: 'confident mistakes survive the session', ru: 'уверенные ошибки доживают до конца сессии' },
    response: {
      en: 'L0/L1/L2 hierarchy, independent acceptance, Council for ambiguous calls',
      ru: 'иерархия L0/L1/L2, независимая приёмка, консилиум для неоднозначных решений',
    },
  },
  {
    id: 'P8',
    problem: { en: 'The same mistakes repeat', ru: 'Одни и те же ошибки повторяются' },
    symptom: { en: 'corrections live in chat logs, not in the project', ru: 'правки живут в логах чата, а не в проекте' },
    response: {
      en: 'complaint → playbook mutation → next session behaves differently',
      ru: 'жалоба → мутация playbook → следующая сессия ведёт себя иначе',
    },
  },
  {
    id: 'P9',
    problem: { en: 'Quality degrades over a long process', ru: 'Качество деградирует на длинном процессе' },
    symptom: { en: 'context bloat, drifting goals, lost decisions', ru: 'раздутый контекст, дрейф цели, потерянные решения' },
    response: {
      en: 'briefs, checkpoints, typed state continuity',
      ru: 'брифы, чекпоинты, непрерывность типизированного состояния',
    },
  },
]
</script>

<template>
  <section class="wolf-home-section wolf-why">
    <p class="wolf-home-label">{{ t({ en: '01 · PROBLEM', ru: '01 · ПРОБЛЕМА' }) }}</p>
    <h2 class="wolf-home-title">{{ t({ en: 'Why Mr. Wolf?', ru: 'Почему Mr. Wolf?' }) }}</h2>
    <p class="wolf-why-text">{{
      t({
        en: 'A persistent organization — not another memory add-on. AI coding agents are powerful but temporary: every session starts from zero, lessons evaporate, and one agent grades its own homework. Mr. Wolf turns that stream of temporary agents into a permanent project organization with roles, processes and memory that outlives any session.',
        ru: 'Постоянная организация — не очередное memory-дополнение. AI-агенты сильны, но временны: каждая сессия начинается с нуля, уроки испаряются, а один агент сам проверяет свою работу. Mr. Wolf превращает поток временных агентов в постоянную проектную организацию с ролями, процессами и памятью, которые переживают любую сессию.'
      })
    }}</p>
    <!-- data-label: mobile cards caption each field via td::before (pure CSS) -->
    <table class="wolf-why-table">
      <thead v-if="!ru">
        <tr>
          <th>#</th>
          <th>Problem</th>
          <th>Symptom</th>
          <th>Wolf response</th>
        </tr>
      </thead>
      <thead v-else>
        <tr>
          <th>Проблема</th>
          <th>Проявление</th>
          <th>Ответ Wolf</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in rows" :key="row.id">
          <td v-if="!ru" class="num">{{ row.id }}</td>
          <td :data-label="t({ en: 'PROBLEM', ru: 'ПРОБЛЕМА' })">{{ t(row.problem) }}</td>
          <td :data-label="t({ en: 'SYMPTOM', ru: 'СИМПТОМ' })">{{ t(row.symptom) }}</td>
          <td class="resp" :data-label="t({ en: 'WOLF RESPONSE', ru: 'ОТВЕТ WOLF' })">{{ t(row.response) }}</td>
        </tr>
      </tbody>
    </table>
    <p class="wolf-why-footnote">{{
      t({
        en: 'P5–P6 (capture/reuse failure) are answered by the learning loop and the tool pipeline — see the Learning Loop.',
        ru: 'П5–П6 (capture/reuse failure) закрывают контур обучения и конвейер инструментов — см. Контур обучения.'
      })
    }}</p>
    <p v-if="!ru" class="wolf-why-outro">
      Ready to give your project an organization? Start with the
      <a :href="withBase('/guide/getting-started')">Getting Started guide</a>.
    </p>
    <p v-else class="wolf-why-outro">
      Как подключить Wolf к проекту — в
      <a :href="withBase('/ru/guide/getting-started')">Начале работы</a>.
    </p>
  </section>
</template>

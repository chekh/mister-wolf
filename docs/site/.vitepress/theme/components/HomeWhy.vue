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
]
</script>

<template>
  <section class="wolf-home-section wolf-why">
    <p class="wolf-home-label">{{ t({ en: '01 · PROBLEM', ru: '01 · ПРОБЛЕМА' }) }}</p>
    <h2 class="wolf-home-title">{{ t({ en: 'Why Mr. Wolf?', ru: 'Почему' }) }}</h2>
    <p class="wolf-why-text">{{
      t({
        en: 'AI coding agents are powerful but forgetful. Mr. Wolf is a local-first environment for continuous agent work. It preserves project knowledge, organizes processes, and delivers the right context between sessions via CLI and MCP. Wolf doesn’t replace the model and doesn’t tie your project to one agent platform. It creates a persistent organization of work on top of different agents. Accumulation instead of evaporation.',
        ru: 'AI-агенты решают задачи, но их опыт испаряется вместе с сессией. Mr. Wolf — local-first среда непрерывной работы агентов. Она сохраняет знания проекта, организует процессы и доставляет нужный контекст между сессиями через CLI и MCP. Wolf не заменяет модель и не привязывает проект к одной агентской платформе. Он создаёт постоянную организацию работы поверх разных агентов. Накопление вместо испарения: решения, уроки, инструменты и процессы остаются в проекте после сессии и делают следующую задачу дешевле.'
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
    <p v-if="!ru" class="wolf-why-outro">
      Ready to give your agents a memory? Start with the
      <a :href="withBase('/guide/getting-started')">Getting Started guide</a>.
    </p>
    <p v-else class="wolf-why-outro">
      Как подключить Wolf к проекту — в
      <a :href="withBase('/ru/guide/getting-started')">Начале работы</a>.
    </p>
  </section>
</template>

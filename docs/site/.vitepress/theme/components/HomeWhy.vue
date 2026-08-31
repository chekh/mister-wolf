<script setup lang="ts">
import { computed } from 'vue'
import { useData, withBase } from 'vitepress'

type L = { en: string; ru: string }

const { lang } = useData()
// Reactive: `lang` changes on client-side locale navigation (no reload);
// a plain boolean would freeze the first-loaded locale.
const ru = computed(() => lang.value.startsWith('ru'))
const t = (s: L): string => (ru.value ? s.ru : s.en)

// Bilingual row objects: the former EN/RU array pair indexed row[1]/row[2],
// and the 2-element RU arrays rendered symptom-in-problem-column + an empty
// column. Named fields are index-proof for both locales.
type Row = { id: string; problem: L; symptom: L }
const rows: Row[] = [
  {
    id: 'P1',
    problem: { en: 'Context is lost between sessions', ru: 'Контекст теряется между сессиями' },
    symptom: { en: 'the agent starts from scratch', ru: 'агент начинает с нуля' },
  },
  {
    id: 'P2',
    problem: { en: 'Experience is not reused', ru: 'Опыт не переиспользуется' },
    symptom: {
      en: 'recurring tasks are solved from scratch: prose reasoning + new one-off scripts',
      ru: 'повторные задачи решаются заново',
    },
  },
  {
    id: 'P3',
    problem: { en: 'Project documents live apart from agents', ru: 'Документы живут отдельно от агентов' },
    symptom: { en: 'no single source of truth', ru: 'единой точки правды нет' },
  },
  {
    id: 'P4',
    problem: { en: 'Accumulated knowledge becomes noise', ru: 'Накопленное становится шумом' },
    symptom: { en: 'memory grows, value drops', ru: 'память растёт, ценность падает' },
  },
]
</script>

<template>
  <section class="wolf-home-section wolf-why">
    <p class="wolf-home-label">WHY</p>
    <h2 class="wolf-home-title">{{ t({ en: 'Why Mr. Wolf?', ru: 'Почему' }) }}</h2>
    <p class="wolf-why-text">{{
      t({
        en: 'AI coding agents are powerful but forgetful. Mr. Wolf is a local-first environment for continuous agent work. It preserves project knowledge, organizes processes, and delivers the right context between sessions via CLI and MCP. Wolf doesn’t replace the model and doesn’t tie your project to one agent platform. It creates a persistent organization of work on top of different agents. Accumulation instead of evaporation.',
        ru: 'AI-агенты решают задачи, но их опыт испаряется вместе с сессией. Mr. Wolf — local-first среда непрерывной работы агентов. Она сохраняет знания проекта, организует процессы и доставляет нужный контекст между сессиями через CLI и MCP. Wolf не заменяет модель и не привязывает проект к одной агентской платформе. Он создаёт постоянную организацию работы поверх разных агентов. Накопление вместо испарения: решения, уроки, инструменты и процессы остаются в проекте после сессии и делают следующую задачу дешевле.'
      })
    }}</p>
    <table class="wolf-why-table">
      <thead v-if="!ru">
        <tr>
          <th>#</th>
          <th>Problem</th>
          <th>Symptom</th>
        </tr>
      </thead>
      <thead v-else>
        <tr>
          <th>Проблема</th>
          <th>Проявление</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in rows" :key="row.id">
          <td v-if="!ru" class="num">{{ row.id }}</td>
          <td>{{ t(row.problem) }}</td>
          <td>{{ t(row.symptom) }}</td>
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

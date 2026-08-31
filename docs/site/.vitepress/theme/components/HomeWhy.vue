<script setup lang="ts">
import { useData, withBase } from 'vitepress'

type L = { en: string; ru: string }

const { lang } = useData()
const ru = lang.value.startsWith('ru')
const t = (s: L): string => (ru ? s.ru : s.en)

// Verbatim from docs/site/index.md and docs/site/ru/index.md (former home bodies)
const rowsEn: string[][] = [
  ['P1', 'Context is lost between sessions', 'the agent starts from scratch'],
  ['P2', 'Experience is not reused', 'recurring tasks are solved from scratch: prose reasoning + new one-off scripts'],
  ['P3', 'Project documents live apart from agents', 'no single source of truth'],
  ['P4', 'Accumulated knowledge becomes noise', 'memory grows, value drops'],
]

const rowsRu: string[][] = [
  ['Контекст теряется между сессиями', 'агент начинает с нуля'],
  ['Опыт не переиспользуется', 'повторные задачи решаются заново'],
  ['Документы живут отдельно от агентов', 'единой точки правды нет'],
  ['Накопленное становится шумом', 'память растёт, ценность падает'],
]
</script>

<template>
  <section class="wolf-home-section wolf-why">
    <p class="wolf-home-label">WHY</p>
    <h2 class="wolf-home-title">{{ t({ en: 'Why Mr. Wolf?', ru: 'Почему' }) }}</h2>
    <p class="wolf-why-text">{{
      t({
        en: 'AI coding agents are powerful but forgetful. Mr. Wolf is a local-first layer of memory, processes, agents and tools for AI coding: a single source of truth that agents write their experience to and read context from. It is not an orchestrator and not yet another agent — it is a substrate under any agent. Accumulation instead of evaporation.',
        ru: 'AI-агенты решают задачи, но их опыт испаряется вместе с сессией. Mr. Wolf — local-first слой памяти для AI-кодинга: единая точка правды проекта, в которую агенты пишут опыт и из которой получают контекст. Не оркестратор и не ещё один агент — субстрат под любого агента. Накопление вместо испарения: решения, уроки, инструменты и процессы остаются в проекте после сессии и делают следующую задачу дешевле.'
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
        <tr v-for="row in ru ? rowsRu : rowsEn" :key="row[0]">
          <td v-if="!ru" class="num">{{ row[0] }}</td>
          <td>{{ row[1] }}</td>
          <td>{{ row[2] }}</td>
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

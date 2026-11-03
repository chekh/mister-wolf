<script setup lang="ts">
import { computed } from 'vue';
import { useData, withBase } from 'vitepress';

type L = { en: string; ru: string };

const { lang } = useData();
// Reactive: `lang` changes on client-side locale navigation (no reload);
// a plain boolean would freeze the first-loaded locale.
const ru = computed(() => lang.value.startsWith('ru'));
const t = (s: L): string => (ru.value ? s.ru : s.en);

// Named bilingual fields: index-proof for both locales; `response` is the
// Wolf answer column. RU table has no # column (numbering is EN-only).
type Row = { id: string; problem: L; symptom: L; response: L };
const rows: Row[] = [
  {
    id: 'G',
    problem: {
      en: 'Keep the goal',
      ru: 'Удерживать цель',
    },
    symptom: {
      en: 'Local difficulties can pull a long task off course',
      ru: 'Частные трудности уводят длинную работу в сторону',
    },
    response: {
      en: 'L0 holds intent; L1 organizes delivery; L2 completes bounded work',
      ru: 'L0 держит намерение; L1 организует поставку; L2 выполняют конечные задачи',
    },
  },
  {
    id: 'P',
    problem: {
      en: 'Connect the methods',
      ru: 'Связать методы',
    },
    symptom: {
      en: 'Skills, tools and rules can remain disconnected',
      ru: 'Скиллы, инструменты и правила остаются разрозненными',
    },
    response: {
      en: 'A process connects context, responsibility, action and acceptance',
      ru: 'Процесс связывает контекст, ответственность, действия и приёмку',
    },
  },
  {
    id: 'M',
    problem: {
      en: 'Continue the project',
      ru: 'Продолжать работу',
    },
    symptom: {
      en: 'Documents and decisions must survive a session',
      ru: 'Документы и решения должны пережить сессию',
    },
    response: {
      en: 'Project documents are memory; recorded state supports continuation',
      ru: 'Документы проекта — память; записанное состояние помогает продолжить',
    },
  },
  {
    id: 'S',
    problem: {
      en: 'Change future behavior',
      ru: 'Менять будущее поведение',
    },
    symptom: {
      en: 'A correction in chat may disappear with the conversation',
      ru: 'Замечание в чате теряется вместе с разговором',
    },
    response: {
      en: 'The Steward aggregates lessons and versions methods through the authorized loop',
      ru: 'Стюард обобщает уроки и меняет версии методик в авторизованном контуре',
    },
  },
  {
    id: 'H',
    problem: {
      en: 'Make work understandable',
      ru: 'Сделать работу понятной',
    },
    symptom: {
      en: 'People should not have to dispatch and decode worker reports',
      ru: 'Человек не должен диспетчировать и расшифровывать отчёты воркеров',
    },
    response: {
      en: 'Wolf clarifies intent, explains choices and integrates the result for you',
      ru: 'Wolf уточняет намерение, объясняет выбор и собирает понятный результат',
    },
  },
];
</script>

<template>
  <section class="wolf-home-section wolf-why">
    <p class="wolf-home-label">{{ t({ en: '01 · WHY WOLF', ru: '01 · ЗАЧЕМ WOLF' }) }}</p>
    <h2 class="wolf-home-title">{{ t({ en: 'Why Mr. Wolf?', ru: 'Почему Mr. Wolf?' }) }}</h2>
    <p class="wolf-why-text">
      {{
        t({
          en: 'Long-running work needs continuity of purpose, responsibility and experience. Wolf connects these through a project-owned organization, with a process for delivery and a separate Steward learning loop.',
          ru: 'Длительной работе нужна преемственность цели, ответственности и опыта. Wolf связывает их в принадлежащую проекту организацию: процесс выполнения задач и отдельный контур обучения через Стюарда.',
        })
      }}
    </p>
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
    <p class="wolf-why-footnote">
      {{
        t({
          en: 'Current full organization: OpenCode-first. The product guide explains the methods, supported capabilities and limits.',
          ru: 'Текущая полная организация — OpenCode-first. Руководство объясняет методы, доступные возможности и границы.',
        })
      }}
    </p>
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

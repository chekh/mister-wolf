<script setup lang="ts">
import { useData } from 'vitepress'

type L = { en: string; ru: string }

const { lang } = useData()
const ru = lang.value.startsWith('ru')
const t = (s: L): string => (ru ? s.ru : s.en)

const modes = [
  {
    name: 'CALL',
    text: t({
      en: 'Cold start: active rules, lessons and blockers delivered into the session, matched to the task (--for, --thread, --compact).',
      ru: 'Холодный старт: актуальные правила, уроки и блокеры доставляются в начало сессии по теме задачи (--for, --thread, --compact).',
    }),
  },
  {
    name: 'SOLVE',
    text: t({
      en: 'A recurring problem gets a solve pack: context, similar lessons, a plan — then the outcome is saved back to memory.',
      ru: 'Повторяющаяся проблема получает solve pack: контекст, похожие уроки, план — результат сохраняется обратно в память.',
    }),
  },
  {
    name: 'LEARN',
    text: t({
      en: 'The self-learning loop: digest patterns → propose draft lessons → validate against evidence → activate as rules.',
      ru: 'Цикл самообучения: digest паттернов → draft урока → проверка по уликам → активация правилом.',
    }),
  },
]
</script>

<template>
  <section class="wolf-home-section wolf-modes">
    <p class="wolf-home-label">MODES</p>
    <h2 class="wolf-home-title">{{ t({ en: 'Call. Solve. Learn.', ru: 'Call. Solve. Learn.' }) }}</h2>
    <div class="wolf-modes-grid">
      <div v-for="mode in modes" :key="mode.name" class="wolf-mode">
        <p class="wolf-mode-name">{{ mode.name }}</p>
        <p class="wolf-mode-text">{{ mode.text }}</p>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useData } from 'vitepress'

type L = { en: string; ru: string }

const { lang } = useData()
const ru = computed(() => lang.value.startsWith('ru'))
const t = (s: L): string => (ru.value ? s.ru : s.en)

// Session copy; LESSON/VERIFIED marks live in the memory object (system marks, EN)
const discover = computed(() => t({
  en: 'An agent hits a failing test, digs in, finds the cause — and writes a LESSON to Wolf memory.',
  ru: 'Агент натыкается на падающий тест, разбирается, находит причину — и записывает LESSON в память Wolf.',
}))

const inject = computed(() => t({
  en: 'A different agent starts a new session — Wolf injects the lesson at cold start. The problem is not rediscovered.',
  ru: 'Другой агент начинает новую сессию — Wolf доставляет урок на старте. Проблему не переоткрывают.',
}))
</script>

<template>
  <section id="sessions" class="wolf-home-section wolf-sessions">
    <p class="wolf-home-label">{{ t({ en: '02 · MEMORY ACROSS SESSIONS', ru: '02 · ПАМЯТЬ МЕЖДУ СЕССИЯМИ' }) }}</p>
    <h2 class="wolf-home-title">{{ t({ en: 'Two sessions, one memory', ru: 'Две сессии — одна память' }) }}</h2>
    <div class="wolf-sessions-flow">
      <div class="wolf-sessions-col">
        <span class="wolf-sessions-node" aria-hidden="true" />
        <article class="wolf-card">
          <div class="wolf-card-in">
            <p class="wolf-session-tag">SESSION 01 · DISCOVER</p>
            <p class="wolf-session-text">{{ discover }}</p>
          </div>
        </article>
      </div>
      <div class="wolf-sessions-col">
        <span class="wolf-sessions-node is-filled" aria-hidden="true" />
        <!-- the memory object itself — a stored file, not a card -->
        <div class="wolf-memobj">
          <p class="wolf-memobj-head">
            <span class="wolf-memobj-type">LESSON</span>
            <span class="wolf-memobj-status">VERIFIED</span>
          </p>
          <p class="wolf-memobj-id">mem_20260901_4b7c21</p>
          <p class="wolf-memobj-path">stored in .wolf/memory/</p>
        </div>
      </div>
      <div class="wolf-sessions-col">
        <span class="wolf-sessions-node" aria-hidden="true" />
        <article class="wolf-card">
          <div class="wolf-card-in">
            <p class="wolf-session-tag">SESSION 02 · INJECT</p>
            <p class="wolf-session-text">{{ inject }}</p>
          </div>
        </article>
      </div>
    </div>
    <p class="wolf-sessions-takeaway">{{ t({
      en: 'Experience doesn\u2019t evaporate — it becomes project infrastructure.',
      ru: 'Опыт не испаряется. Он становится инфраструктурой проекта.'
    }) }}</p>
  </section>
</template>

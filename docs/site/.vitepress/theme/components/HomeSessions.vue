<script setup lang="ts">
import { computed } from 'vue'
import { useData } from 'vitepress'

type L = { en: string; ru: string }

const { lang } = useData()
const ru = computed(() => lang.value.startsWith('ru'))
const t = (s: L): string => (ru.value ? s.ru : s.en)

// red thread: problem → LESSON/ACTIVE (highlighted spans are our own static strings)
const session1 = computed(() => t({
  en: 'An agent hits a <span class="hl">failing test</span>, digs in, finds the cause — and writes a <span class="hl tag">LESSON</span> to Wolf memory (status: <span class="hl tag">ACTIVE</span>).',
  ru: 'Агент натыкается на <span class="hl">падающий тест</span>, разбирается, находит причину — и записывает <span class="hl tag">LESSON</span> в память Wolf (статус: <span class="hl tag">ACTIVE</span>).',
}))
</script>

<template>
  <section class="wolf-home-section wolf-sessions">
    <p class="wolf-home-label">SESSIONS</p>
    <h2 class="wolf-home-title">{{ t({ en: 'Two sessions, one memory', ru: 'Две сессии — одна память' }) }}</h2>
    <div class="wolf-sessions-grid">
      <article class="wolf-card">
        <div class="wolf-card-in">
          <p class="wolf-session-tag">SESSION 1 · DISCOVER</p>
          <!-- eslint-disable-next-line vue/no-v-html -- static trusted string -->
          <p class="wolf-session-text" v-html="session1" />
        </div>
      </article>
      <article class="wolf-card">
        <div class="wolf-card-in">
          <p class="wolf-session-tag">SESSION 2 · INJECT</p>
          <p class="wolf-session-text">{{ t({
            en: 'A different agent starts a new session. Wolf injects the lesson at cold start — the problem is not rediscovered.',
            ru: 'Другой агент начинает новую сессию. Wolf доставляет урок инъекцией на старте — проблему не переоткрывают.'
          }) }}</p>
        </div>
      </article>
    </div>
    <p class="wolf-sessions-takeaway">{{ t({
      en: 'Experience doesn\u2019t evaporate — it becomes project infrastructure.',
      ru: 'Опыт не испаряется. Он становится инфраструктурой проекта.'
    }) }}</p>
  </section>
</template>

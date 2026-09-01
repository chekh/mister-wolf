<script setup lang="ts">
// Static by design: no typing animation (reduced-motion friendly).
import { computed } from 'vue'
import { useData } from 'vitepress'

type L = { en: string; ru: string }

const { lang } = useData()
// Reactive: `lang` changes on client-side locale navigation (no reload).
const ru = computed(() => lang.value.startsWith('ru'))
const t = (s: L): string => (ru.value ? s.ru : s.en)

// Illustrative demo, coherent with the query: what a real
// `wolf call --for "auth refactor"` would plausibly return. Type labels
// (RULE/LESSON/BLOCKER) and statuses stay EN — they are system marks.
const items = computed(() => [
  {
    type: 'RULE',
    id: 'mem_20260812_7c4f21',
    status: 'ACTIVE',
    statusClass: 'st-active',
    glyph: '──●',
    glyphClass: 'wg-active',
    desc: t({ en: 'Use the repository AuthGateway', ru: 'Использовать AuthGateway из репозитория' }),
  },
  {
    type: 'LESSON',
    id: 'mem_20260818_9a3d07',
    status: 'ACCEPTED',
    statusClass: 'st-verified',
    glyph: '──✓',
    glyphClass: 'wg-verified',
    desc: t({ en: 'Integration tests need isolated Redis', ru: 'Интеграционным тестам нужен изолированный Redis' }),
  },
  {
    type: 'BLOCKER',
    id: 'mem_20260829_e5b842',
    status: 'OPEN',
    statusClass: 'st-open',
    glyph: '──○',
    glyphClass: 'wg-open',
    desc: t({ en: 'Migration 024 must run first', ru: 'Сначала должна выполниться миграция 024' }),
  },
])
</script>

<template>
  <div class="wolf-terminal" aria-label="wolf call — session injection preview">
    <div class="wolf-terminal-bar">
      <span class="dot dot-signal" />
      <span class="dot dot-brass" />
      <span class="dot dot-verified" />
      <span class="wolf-terminal-title">wolf · session-injection</span>
    </div>
    <div class="wolf-terminal-body">
      <p class="wolf-terminal-cmd">$ wolf call --for &quot;auth refactor&quot;</p>

      <ul class="wolf-thread">
        <li
          v-for="(item, i) in items"
          :key="item.id"
          class="wolf-thread-item"
          :class="{ 'is-last': i === items.length - 1 }"
        >
          <span class="node" aria-hidden="true" />
          <span class="type">{{ item.type }}</span>
          <span class="id">{{ item.id }}</span>
          <span class="status" :class="item.statusClass">
            <span class="wolf-glyph" :class="item.glyphClass" aria-hidden="true">{{ item.glyph }}</span>
            {{ item.status }}
          </span>
          <span class="desc">{{ item.desc }}</span>
        </li>
      </ul>

      <p class="wolf-terminal-result">{{ t({ en: '✓ 3 relevant memories injected', ru: '✓ Внедрено 3 релевантных объекта памяти' }) }}</p>
    </div>
  </div>
</template>

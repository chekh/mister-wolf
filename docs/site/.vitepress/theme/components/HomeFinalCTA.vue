<script setup lang="ts">
import { computed } from 'vue'
import { useData, withBase } from 'vitepress'

type L = { en: string; ru: string }

const { lang } = useData()
const ru = computed(() => lang.value.startsWith('ru'))
const t = (s: L): string => (ru.value ? s.ru : s.en)
</script>

<template>
  <section class="wolf-home-section wolf-finalcta">
    <!-- geometry mirrors trace-mark-a.svg / base.css data-URIs — change in all places -->
    <svg
      class="wolf-finalcta-mark"
      width="64"
      height="64"
      viewBox="0 0 32 32"
      role="img"
      aria-label="Mr. Wolf — trace mark"
    >
      <path
        d="M3 10 L9 25 L16 11 L23 25 L29 9"
        fill="none"
        stroke="#c49a4a"
        stroke-width="2.5"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <circle cx="3" cy="10" r="2.6" fill="#c49a4a" />
      <circle cx="9" cy="25" r="2.6" fill="#c49a4a" />
      <circle cx="16" cy="11" r="2.6" fill="#c49a4a" />
      <circle cx="23" cy="25" r="2.6" fill="#c49a4a" />
      <circle cx="29" cy="9" r="3.2" fill="#d43a2f" />
    </svg>
    <p class="wolf-home-label">{{ t({ en: '06 · START', ru: '06 · СТАРТ' }) }}</p>
    <p class="wolf-finalcta-status">PROJECT MEMORY READY</p>
    <p class="wolf-finalcta-note">{{
      t({ en: 'Give your agents a memory.', ru: 'Дайте вашим агентам память.' })
    }}</p>
    <div class="wolf-finalcta-actions">
      <a
        class="wolf-btn wolf-btn-brand"
        :href="withBase(t({ en: '/guide/getting-started', ru: '/ru/guide/getting-started' }))"
      >{{ t({ en: 'Get Started', ru: 'Начать работу' }) }}</a>
      <a
        class="wolf-btn wolf-btn-alt"
        href="https://github.com/chekh/mister-wolf"
      >GitHub</a>
    </div>
  </section>
</template>

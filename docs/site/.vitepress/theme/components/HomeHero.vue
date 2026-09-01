<script setup lang="ts">
import { computed } from 'vue'
import { useData, withBase } from 'vitepress'
import HeroTerminal from './HeroTerminal.vue'

type L = { en: string; ru: string }

const { lang } = useData()
const ru = computed(() => lang.value.startsWith('ru'))
const t = (s: L): string => (ru.value ? s.ru : s.en)
</script>

<template>
  <section class="wolf-hero">
    <div class="wolf-hero-grid">
      <p class="wolf-hero-label">PROJECT MEMORY · LOCAL-FIRST</p>
      <h1 class="wolf-hero-title">
        {{ t({ en: 'Agents forget.', ru: 'Агенты забывают.' }) }}<br />{{
          t({ en: "Mr. Wolf doesn't.", ru: 'Mr. Wolf — нет.' })
        }}
      </h1>
      <div class="wolf-hero-figure">
        <picture>
          <source type="image/webp" :srcset="withBase('/mark/wolf-emblem.webp')" />
          <img
            :src="withBase('/mark/wolf-emblem.png')"
            alt="Mr. Wolf — emblem"
            width="1254"
            height="1254"
            fetchpriority="high"
            decoding="async"
          />
        </picture>
      </div>
      <p class="wolf-hero-sub">{{
        t({
          en: 'Project memory that outlives the session.',
          ru: 'Память проекта, которая переживает сессию.'
        })
      }}</p>
      <p class="wolf-hero-mech">{{
        t({
          en: 'Mr. Wolf stores decisions, rules, and lessons inside the project and returns them to agents in later sessions via CLI and MCP.',
          ru: 'Mr. Wolf сохраняет решения, правила и уроки внутри проекта и возвращает их агентам в следующих сессиях через CLI и MCP.'
        })
      }}</p>
      <blockquote class="wolf-hero-statement">
        <p class="wolf-stmt-label">SUBJECT STATEMENT</p>
        <p class="wolf-stmt-quote">{{
          t({
            en: '“I solve problems. But first, I remember.”',
            ru: '«Я решаю проблемы. Но сначала вспоминаю, как мы решали их раньше.»'
          })
        }}</p>
        <p v-if="ru" class="wolf-stmt-quote-en">&ldquo;I solve problems. But first, I remember.&rdquo;</p>
      </blockquote>
      <div class="wolf-hero-actions">
        <a
          class="wolf-btn wolf-btn-brand"
          :href="withBase(t({ en: '/guide/getting-started', ru: '/ru/guide/getting-started' }))"
        >{{ t({ en: 'Get Started', ru: 'Начать работу' }) }}</a>
        <a class="wolf-btn wolf-btn-alt" href="#sessions">{{
          t({ en: 'See how it works', ru: 'Как это работает' })
        }}</a>
      </div>
      <HeroTerminal />
    </div>
  </section>
</template>

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
      <div class="wolf-hero-copy">
        <p class="wolf-hero-label">{{ t({ en: 'AGENTIC PROJECT GOVERNANCE · LOCAL-FIRST', ru: 'АГЕНТНАЯ ОРГАНИЗАЦИЯ ПРОЕКТА · LOCAL-FIRST' }) }}</p>
        <h1 class="wolf-hero-title">
          {{ t({ en: 'Agents are temporary.', ru: 'Агенты — временные.' }) }}<br />{{
            t({ en: "Your project's organization isn't.", ru: 'Организация проекта — постоянная.' })
          }}
        </h1>
        <p class="wolf-hero-sub">{{
          t({
            en: 'Mr. Wolf turns the stream of AI coding agents into a permanent project organization — goals, processes, memory and skills that survive every session.',
            ru: 'Mr. Wolf превращает поток AI-агентов в постоянную проектную организацию: цели, процессы, память и навыки, которые переживают любую сессию.'
          })
        }}</p>
        <p class="wolf-hero-mech">{{
          t({
            en: 'A coordinator owns the goal and accepts results. Executors own delivery. Workers run in clean sessions. Typed memory, a complaint-driven learning loop and a growing tool library make the organization better from session to session — locally, on your terms.',
            ru: 'Координатор держит цель и принимает результат. Executor владеет поставкой. Воркеры работают в чистых сессиях. Типизированная память, контур обучения по жалобам и растущая библиотека инструментов улучшают организацию от сессии к сессии — локально и под вашим контролем.'
          })
        }}</p>
        <blockquote class="wolf-hero-statement">
          <p class="wolf-stmt-label">{{ t({ en: "MR. WOLF'S ANSWER", ru: 'ОТВЕТ МИСТЕРА ВОЛЬФА' }) }}</p>
          <p class="wolf-stmt-quote">{{
            t({
              en: "“I'm Mr. Wolf. I solve problems.”",
              ru: '«Я мистер Вольф. Я решаю проблемы.»'
            })
          }}</p>
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
      </div>
      <div class="wolf-hero-side">
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
        <HeroTerminal />
      </div>
    </div>
  </section>
</template>

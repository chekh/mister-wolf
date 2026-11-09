<script setup lang="ts">
import { computed } from 'vue';
import { useData, withBase } from 'vitepress';
import HeroTerminal from './HeroTerminal.vue';

type L = { en: string; ru: string };

const { lang } = useData();
const ru = computed(() => lang.value.startsWith('ru'));
const t = (s: L): string => (ru.value ? s.ru : s.en);
</script>

<template>
  <section class="wolf-hero">
    <div class="wolf-hero-grid">
      <div class="wolf-hero-copy">
        <p class="wolf-hero-label">
          {{ t({ en: 'YOUR GOAL · A LASTING ORGANIZATION', ru: 'ВАША ЦЕЛЬ · ПОСТОЯННАЯ ОРГАНИЗАЦИЯ' }) }}
        </p>
        <h1 class="wolf-hero-title">
          {{ t({ en: 'Agents are temporary.', ru: 'Агенты — временные.' }) }}<br />{{
            t({ en: "Your project's organization isn't.", ru: 'Организация проекта — постоянная.' })
          }}
        </h1>
        <p class="wolf-hero-sub">
          {{
            t({
              en: 'Mr. Wolf organizes AI assistants around your goal — and gives you one clear conversation with the organization behind the work.',
              ru: 'Mr. Wolf организует AI-помощников вокруг вашей цели и становится понятной точкой общения с организацией, которая выполняет работу.',
            })
          }}
        </p>
        <p class="wolf-hero-mech">
          {{
            t({
              en: 'One conversation, one organization: mr-wolf does the work itself or hires eight wolf-* specialists directly. Processes connect skills, tools, rules and memory. Project documents and recorded state carry the work into the next session.',
              ru: 'Один диалог — одна организация: mr-wolf выполняет работу сам или нанимает восемь исполнителей wolf-* напрямую. Процессы связывают скиллы, инструменты, правила и память. Документы и записанное состояние сохраняют преемственность между сессиями.',
            })
          }}
        </p>
        <blockquote class="wolf-hero-statement">
          <p class="wolf-stmt-label">{{ t({ en: "MR. WOLF'S ANSWER", ru: 'ОТВЕТ МИСТЕРА ВОЛЬФА' }) }}</p>
          <p class="wolf-stmt-quote">
            {{
              t({
                en: "“I'm Mr. Wolf. I solve problems.”",
                ru: '«Я мистер Вольф. Я решаю проблемы.»',
              })
            }}
          </p>
        </blockquote>
        <div class="wolf-hero-actions">
          <a class="wolf-btn wolf-btn-brand" :href="withBase(t({ en: '/guide/overview', ru: '/ru/guide/overview' }))">{{
            t({ en: 'Meet Wolf', ru: 'Познакомиться с Wolf' })
          }}</a>
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

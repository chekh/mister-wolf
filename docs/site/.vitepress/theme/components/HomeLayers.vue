<script setup lang="ts">
import { computed } from 'vue'
import { useData } from 'vitepress'

type L = { en: string; ru: string }

const { lang } = useData()
const ru = computed(() => lang.value.startsWith('ru'))
const t = (s: L): string => (ru.value ? s.ru : s.en)

// Stack order: TOOLS (execution) at the top → MEMORY (what persists) last
const layers = computed(() => [
  { num: '01', name: 'TOOLS', desc: t({ en: 'Tools the project grew', ru: 'Инструменты, выращенные проектом' }) },
  { num: '02', name: 'AGENTS', desc: t({ en: 'Thin frames, mutable faces', ru: 'Тонкие рамки, мутирующие лица' }) },
  { num: '03', name: 'PROCESSES', desc: t({ en: 'Briefs, checkpoints, acceptance', ru: 'Брифы, чекпоинты, приёмка' }) },
  { num: '04', name: 'MEMORY', desc: t({ en: 'Typed project state', ru: 'Типизированное состояние проекта' }) },
])

// Self-learning loop stages: EN system marks in both locales
const loop = ['SIGNAL', 'PATTERN', 'DRAFT', 'VALIDATE', 'ACTIVATE', 'MEASURE']
</script>

<template>
  <section class="wolf-layers-outer">
    <div class="wolf-home-section wolf-layers">
      <p class="wolf-home-label">{{ t({ en: '03 · ARCHITECTURE', ru: '03 · АРХИТЕКТУРА' }) }}</p>
      <h2 class="wolf-home-title">{{ t({ en: 'Four layers', ru: 'Четыре слоя' }) }}</h2>
      <ol class="wolf-layers-stack">
        <li
          v-for="(layer, i) in layers"
          :key="layer.num"
          class="wolf-layer-item"
          :class="{ 'is-memory': i === layers.length - 1 }"
        >
          <div class="wolf-layer-card">
            <p class="wolf-layer-num">{{ layer.num }}</p>
            <p class="wolf-layer-name">{{ layer.name }}</p>
            <p class="wolf-layer-desc">{{ layer.desc }}</p>
          </div>
        </li>
      </ol>
      <p class="wolf-layers-return">
        <span aria-hidden="true">&darr;</span>
        {{ t({
          en: 'Results return to MEMORY and shape the next pass',
          ru: 'Результаты возвращаются в MEMORY и влияют на следующий проход',
        }) }}
      </p>
      <div class="wolf-learnloop">
        <p class="wolf-learnloop-caption">{{ t({ en: 'Self-learning loop', ru: 'Цикл самообучения' }) }}</p>
        <p class="wolf-learnloop-chain">
          <template v-for="(step, i) in loop" :key="step">
            <span class="wolf-learnloop-step">{{ step }}</span>
            <span v-if="i < loop.length - 1" class="wolf-learnloop-arrow" aria-hidden="true">&rarr;</span>
          </template>
        </p>
      </div>
    </div>
  </section>
</template>

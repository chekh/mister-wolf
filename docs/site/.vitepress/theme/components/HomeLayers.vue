<script setup lang="ts">
import { computed } from 'vue'
import { useData } from 'vitepress'

type L = { en: string; ru: string }

const { lang } = useData()
const ru = computed(() => lang.value.startsWith('ru'))
const t = (s: L): string => (ru.value ? s.ru : s.en)

const layers = computed(() => [
  { num: '01', name: 'MEMORY', desc: t({ en: 'What the project knows', ru: 'Что проект знает' }) },
  { num: '02', name: 'PROCESSES', desc: t({ en: 'How knowledge becomes action', ru: 'Как знание превращается в действие' }) },
  { num: '03', name: 'AGENTS', desc: t({ en: 'Who uses it', ru: 'Кто использует' }) },
  { num: '04', name: 'TOOLS', desc: t({ en: 'What executes', ru: 'Чем выполняется' }) },
])
</script>

<template>
  <section class="wolf-home-section wolf-layers">
    <p class="wolf-home-label">01 · ARCHITECTURE</p>
    <h2 class="wolf-home-title">{{ t({ en: 'Four layers', ru: 'Четыре слоя' }) }}</h2>
    <ol class="wolf-layers-row">
      <li v-for="layer in layers" :key="layer.num" class="wolf-layer">
        <div class="wolf-card">
          <div class="wolf-card-in">
            <p class="wolf-layer-num">{{ layer.num }}</p>
            <p class="wolf-layer-name">{{ layer.name }}</p>
            <p class="wolf-layer-desc">{{ layer.desc }}</p>
          </div>
        </div>
      </li>
    </ol>
    <!-- Closed loop: results return to MEMORY. Label is always EN (system mark). -->
    <div class="wolf-layers-return" role="img" :aria-label="t({ en: 'Results return to memory', ru: 'Результаты возвращаются в память' })">
      <span class="wolf-layers-return-label">&larr; results</span>
    </div>
  </section>
</template>

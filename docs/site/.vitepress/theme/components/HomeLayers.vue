<script setup lang="ts">
import { computed } from 'vue';
import { useData, withBase } from 'vitepress';
const { lang } = useData();
const ru = computed(() => lang.value.startsWith('ru'));
const nodes = computed(() => [
  { x: 320, y: 68, en: 'AGENTS', ru: 'АГЕНТЫ' },
  { x: 540, y: 178, en: 'SKILLS', ru: 'СКИЛЛЫ' },
  { x: 540, y: 398, en: 'TOOLS', ru: 'ИНСТРУМЕНТЫ' },
  { x: 320, y: 508, en: 'MEMORY', ru: 'ПАМЯТЬ' },
  { x: 100, y: 398, en: 'RULES', ru: 'ПРАВИЛА' },
  { x: 100, y: 178, en: 'STEWARD', ru: 'СТЮАРД' },
]);
</script>

<template>
  <section id="process" class="wolf-layers-outer">
    <div class="wolf-home-section wolf-system">
      <p class="wolf-home-label">{{ ru ? '03 · ЕДИНЫЙ ПРОЦЕСС' : '03 · ONE WORKING PROCESS' }}</p>
      <h2 class="wolf-home-title">
        {{ ru ? 'Связи превращают компоненты в организацию' : 'The connections make an organization' }}
      </h2>
      <p>
        {{
          ru
            ? 'Вы обсуждаете цель с Wolf. Процесс связывает нужных исполнителей, методики, инструменты, правила и память; Стюард использует опыт для управляемого изменения будущей работы.'
            : 'You discuss the goal with Wolf. The process connects the right workers, methods, tools, rules and memory; the Steward uses experience to make controlled changes to future work.'
        }}
      </p>
      <div class="wolf-system-map">
        <svg
          viewBox="0 0 640 570"
          role="img"
          :aria-label="
            ru
              ? 'Процесс в центре связывает агентов, скиллы, инструменты, память, правила и Стюарда'
              : 'A central process connects agents, skills, tools, memory, rules and the Steward'
          "
        >
          <circle cx="320" cy="288" r="220" class="system-ring" />
          <line v-for="n in nodes" :key="n.en + '-line'" x1="320" y1="288" :x2="n.x" :y2="n.y" class="system-line" />
          <circle cx="320" cy="288" r="101" class="system-core" />
          <text x="320" y="276" class="system-center">{{ ru ? 'ПРОЦЕСС' : 'PROCESS' }}</text>
          <text x="320" y="302" class="system-small">{{ ru ? 'ЦЕЛЬ → РЕЗУЛЬТАТ' : 'GOAL → RESULT' }}</text>
          <g v-for="n in nodes" :key="n.en">
            <rect :x="n.x - 88" :y="n.y - 26" width="176" height="52" rx="8" class="system-node" />
            <text :x="n.x" :y="n.y + 5" class="system-label">{{ ru ? n.ru : n.en }}</text>
          </g>
        </svg>
      </div>
      <ul class="wolf-system-meaning">
        <li>
          {{
            ru
              ? 'Агенты распределяют ответственность; скиллы задают методы; инструменты выполняют операции.'
              : 'Agents divide responsibility; skills supply methods; tools perform operations.'
          }}
        </li>
        <li>
          {{
            ru
              ? 'Правила задают границы. Память включает документы проекта, решения и записанное состояние.'
              : 'Rules set boundaries. Memory includes project documents, decisions and recorded state.'
          }}
        </li>
        <li>
          {{
            ru
              ? 'Стюард обобщает уроки и изменяет лица по авторизованному протоколу. Новые версии доставляются последующим сессиям.'
              : 'The Steward aggregates lessons and changes faces through the authorized protocol. New versions reach later sessions.'
          }}
        </li>
      </ul>
      <p class="wolf-system-caption">
        {{
          ru
            ? 'Карта устройства и связей. Без условных баллов эффективности или рейтинга других решений.'
            : 'A map of roles and relationships, without invented effectiveness scores or competitor rankings.'
        }}
      </p>
      <a :href="withBase(ru ? '/ru/guide/overview' : '/guide/overview')">{{
        ru ? 'Как работает Wolf →' : 'How Wolf works →'
      }}</a>
    </div>
  </section>
</template>

<style scoped>
.wolf-system {
  max-width: 1000px;
}
.wolf-system-map {
  max-width: 640px;
  margin: 1.5rem auto;
}
.wolf-system-map svg {
  display: block;
  width: 100%;
  height: auto;
  overflow: visible;
}
.system-ring {
  fill: none;
  stroke: var(--vp-c-divider);
  stroke-width: 2;
}
.system-line {
  stroke: #a9803e;
  stroke-width: 1.5;
}
.system-core {
  fill: var(--vp-c-bg-soft);
  stroke: #c49a4a;
  stroke-width: 2;
}
.system-node {
  fill: var(--vp-c-bg);
  stroke: #a9803e;
  stroke-width: 1.5;
}
.system-center,
.system-label,
.system-small {
  text-anchor: middle;
  fill: var(--vp-c-text-1);
  font-family: inherit;
}
.system-center {
  font-size: 23px;
  font-weight: 600;
}
.system-label {
  font-size: 17px;
}
.system-small {
  font-size: 12px;
}
.wolf-system-meaning {
  padding-left: 1.25rem;
  line-height: 1.8;
}
.wolf-system-caption {
  font-size: 0.875rem;
  color: var(--vp-c-text-2);
}
</style>

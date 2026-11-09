<script setup lang="ts">
import { computed } from 'vue';
import { useData } from 'vitepress';

type L = { en: string; ru: string };

const { lang } = useData();
const ru = computed(() => lang.value.startsWith('ru'));
const t = (s: L): string => (ru.value ? s.ru : s.en);

// Illustrative user requests, not CLI commands or recorded runs.
const modes = computed(() =>
  [
    {
      name: 'GOAL',
      status: 'DIALOGUE',
      statusClass: 'st-available',
      cmd: {
        en: '"Help me reach this outcome"',
        ru: '«Помоги получить такой результат»',
      },
      input: {
        en: 'your intent and constraints.',
        ru: 'ваше намерение и ограничения.',
      },
      output: {
        en: 'Wolf clarifies what matters and establishes acceptance criteria.',
        ru: 'Wolf уточняет существенное и формирует критерии результата.',
      },
    },
    {
      name: 'DELIVERY',
      status: 'PROCESS',
      statusClass: 'st-available',
      cmd: {
        en: '"Show what is ready and what is blocked"',
        ru: '«Покажи, что готово и что мешает»',
      },
      input: {
        en: 'an agreed task.',
        ru: 'согласованная задача.',
      },
      output: {
        en: 'L1 organizes bounded L2 work; the result is integrated and checked against the goal.',
        ru: 'L1 организует конечные задачи L2; итог интегрируется и проверяется относительно цели.',
      },
    },
    {
      name: 'LEARNING',
      status: 'GOVERNED',
      statusClass: 'st-available',
      cmd: {
        en: '"Check whether this method needs changing"',
        ru: '«Проверь, нужно ли изменить методику»',
      },
      input: {
        en: 'a specific observation and expected behavior.',
        ru: 'конкретное наблюдение и ожидаемое поведение.',
      },
      output: {
        en: 'Feedback is accepted and recorded through the authorized loop; the Steward that applies method changes is temporarily paused in 3.0.0.',
        ru: 'Обратная связь принимается и фиксируется в авторизованном контуре; Стюард, применяющий изменения методик, в 3.0.0 временно отключён.',
      },
    },
  ].map((row) => ({ ...row, cmd: t(row.cmd), input: t(row.input), output: t(row.output) }))
);
</script>

<template>
  <section class="wolf-home-section wolf-modes">
    <p class="wolf-home-label">{{ t({ en: '04 · YOUR CONVERSATION', ru: '04 · ВАШ ДИАЛОГ' }) }}</p>
    <h2 class="wolf-home-title">{{ t({ en: 'One point of contact', ru: 'Одна точка общения' }) }}</h2>
    <p>
      {{
        t({
          en: 'Illustrative requests to Wolf, not CLI commands or recorded runs.',
          ru: 'Примеры обращений к Wolf, а не CLI-команды или фактический прогон.',
        })
      }}
    </p>
    <div class="wolf-modes-grid">
      <article v-for="mode in modes" :key="mode.name" class="wolf-card wolf-mode">
        <div class="wolf-card-in">
          <p class="wolf-mode-head">
            <span class="wolf-mode-name">{{ mode.name }}</span>
            <span class="wolf-stamp wolf-mode-status" :class="mode.statusClass">{{ mode.status }}</span>
          </p>
          <p class="wolf-install-cmd wolf-mode-cmd">
            <code>{{ mode.cmd }}</code>
          </p>
          <p class="wolf-mode-io">
            <span class="wolf-mode-io-k">{{ t({ en: 'Input:', ru: 'Вход:' }) }}</span
            >{{ mode.input }}
          </p>
          <p class="wolf-mode-io">
            <span class="wolf-mode-io-k">{{ t({ en: 'Output:', ru: 'Результат:' }) }}</span
            >{{ mode.output }}
          </p>
        </div>
      </article>
    </div>
  </section>
</template>

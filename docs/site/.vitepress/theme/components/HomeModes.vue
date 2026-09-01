<script setup lang="ts">
import { computed } from 'vue'
import { useData } from 'vitepress'

type L = { en: string; ru: string }

const { lang } = useData()
const ru = computed(() => lang.value.startsWith('ru'))
const t = (s: L): string => (ru.value ? s.ru : s.en)

// statuses sourced from docs/concept/maturity.md: CLI/MCP core I3/E3 (AVAILABLE);
// solve implemented+dogfooded, no maturity row yet (PREVIEW);
// learn pipeline I2/E2 core but pattern clustering I0/E0 (EXPERIMENTAL)
const modes = computed(() => [
  {
    name: 'CALL',
    status: 'AVAILABLE',
    statusClass: 'st-available',
    cmd: '$ wolf call --for "auth refactor"',
    input: t({ en: 'the task at hand.', ru: 'тема задачи или ветка — задача сессии.' }),
    output: t({
      en: 'active rules, lessons and blockers injected at session start.',
      ru: 'активные правила, уроки и блокеры доставлены в начало сессии.',
    }),
  },
  {
    name: 'SOLVE',
    status: 'PREVIEW',
    statusClass: 'st-preview',
    cmd: '$ wolf solve "broken links" --save',
    input: t({ en: 'a recurring problem.', ru: 'повторяющаяся проблема.' }),
    output: t({
      en: 'a solve pack — context, similar lessons, a plan; the outcome is saved back to memory.',
      ru: 'solve pack — контекст, похожие уроки, план; итог сохраняется в память.',
    }),
  },
  {
    name: 'LEARN',
    status: 'EXPERIMENTAL',
    statusClass: 'st-experimental',
    cmd: '$ wolf learn digest → propose → validate → activate',
    input: t({ en: 'the session signal log — errors, complaints, metrics.', ru: 'сигнал-лог сессий — ошибки, жалобы, метрики.' }),
    output: t({ en: 'validated lessons become active rules.', ru: 'проверенные уроки становятся активными правилами.' }),
  },
])
</script>

<template>
  <section class="wolf-home-section wolf-modes">
    <p class="wolf-home-label">{{ t({ en: '04 · OPERATIONS', ru: '04 · ОПЕРАЦИИ' }) }}</p>
    <h2 class="wolf-home-title">{{ t({ en: 'Call. Solve. Learn.', ru: 'Call. Solve. Learn.' }) }}</h2>
    <div class="wolf-modes-grid">
      <article v-for="mode in modes" :key="mode.name" class="wolf-card wolf-mode">
        <div class="wolf-card-in">
          <p class="wolf-mode-head">
            <span class="wolf-mode-name">{{ mode.name }}</span>
            <span class="wolf-stamp wolf-mode-status" :class="mode.statusClass">{{ mode.status }}</span>
          </p>
          <p class="wolf-install-cmd wolf-mode-cmd"><code>{{ mode.cmd }}</code></p>
          <p class="wolf-mode-io">
            <span class="wolf-mode-io-k">{{ t({ en: 'Input:', ru: 'Вход:' }) }}</span>{{ mode.input }}
          </p>
          <p class="wolf-mode-io">
            <span class="wolf-mode-io-k">{{ t({ en: 'Output:', ru: 'Результат:' }) }}</span>{{ mode.output }}
          </p>
        </div>
      </article>
    </div>
  </section>
</template>

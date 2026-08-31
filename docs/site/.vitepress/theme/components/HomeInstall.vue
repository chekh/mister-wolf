<script setup lang="ts">
import { useData } from 'vitepress'

type L = { en: string; ru: string }

const { lang } = useData()
const ru = lang.value.startsWith('ru')
const t = (s: L): string => (ru ? s.ru : s.en)

// Commands verbatim from guide/getting-started.md:18-20
const steps = [
  {
    num: '01',
    name: 'MACHINE',
    cmd: 'npm install -g mister-wolf',
    state: 'BINARY READY',
    note: t({ en: 'the wolf binary', ru: 'бинарник wolf' }),
  },
  {
    num: '02',
    name: 'PROJECT',
    cmd: 'wolf init',
    state: 'PROJECT CONNECTED',
    note: t({
      en: 'creates the .wolf/ skeleton and writes MCP configs',
      ru: 'создаёт скелет .wolf/ и пишет MCP-конфиги платформ',
    }),
  },
  {
    num: '03',
    name: 'MEMORY',
    cmd: 'wolf bootstrap',
    state: 'MEMORY INITIALIZED',
    note: t({
      en: 'drafts starting memory from project documents',
      ru: 'черновит стартовую память из документов проекта',
    }),
  },
]
</script>

<template>
  <section class="wolf-home-section wolf-install">
    <p class="wolf-home-label">OPERATION · INSTALL</p>
    <h2 class="wolf-home-title">{{ t({ en: 'Three commands', ru: 'Три команды' }) }}</h2>
    <div class="wolf-install-grid">
      <template v-for="(step, i) in steps" :key="step.num">
        <article class="wolf-install-step">
          <div class="wolf-card">
            <div class="wolf-card-in">
              <p class="wolf-install-step-tag">{{ step.num }} {{ step.name }}</p>
              <p class="wolf-install-cmd"><code>{{ step.cmd }}</code></p>
              <p class="wolf-install-state"><span class="wolf-stamp">{{ step.state }}</span></p>
              <p class="wolf-install-note">{{ step.note }}</p>
            </div>
          </div>
        </article>
        <span v-if="i < steps.length - 1" class="wolf-install-arrow" aria-hidden="true">&rarr;</span>
      </template>
    </div>
  </section>
</template>

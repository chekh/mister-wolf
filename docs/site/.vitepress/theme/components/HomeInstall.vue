<script setup lang="ts">
import { computed } from 'vue';
import { useData } from 'vitepress';

type L = { en: string; ru: string };

const { lang } = useData();
const ru = computed(() => lang.value.startsWith('ru'));
const t = (s: L): string => (ru.value ? s.ru : s.en);

// Commands verbatim from guide/getting-started.md (Installation): one binary,
// then one of two explicit paths — memory (wolf init) or OpenCode
// organization (wolf init --full --platform opencode). REQ-07 (R07): the
// notes state only what a clean run actually does.
const steps = computed(() => [
  {
    num: '01',
    name: 'MACHINE',
    cmd: 'npm install -g mister-wolf',
    state: 'BINARY READY',
    note: t({ en: 'the wolf binary', ru: 'бинарник wolf' }),
  },
  {
    num: '02',
    name: t({ en: 'PATH A · MEMORY', ru: 'ПУТЬ А · ПАМЯТЬ' }),
    cmd: 'wolf init',
    state: 'MEMORY READY',
    note: t({
      en: '.wolf/ skeleton + AGENTS.md — no platform configs, no base set',
      ru: 'скелет .wolf/ + AGENTS.md — без платформенных конфигов и базового сета',
    }),
  },
  {
    num: '03',
    name: t({ en: 'PATH B · OPENCODE', ru: 'ПУТЬ Б · OPENCODE' }),
    cmd: 'wolf init --full --platform opencode',
    state: 'ORG READY',
    note: t({
      en: 'full base set (agents, skills, commands, plugins) + opencode.json MCP config',
      ru: 'полный базовый набор (агенты, скиллы, команды, плагины) + MCP-конфиг opencode.json',
    }),
  },
]);
</script>

<template>
  <section class="wolf-home-section wolf-install">
    <p class="wolf-home-label">{{ t({ en: '05 · INSTALL', ru: '05 · УСТАНОВКА' }) }}</p>
    <h2 class="wolf-home-title">{{ t({ en: 'One binary, two paths', ru: 'Один бинарь, два пути' }) }}</h2>
    <div class="wolf-install-grid">
      <article v-for="step in steps" :key="step.num" class="wolf-install-step">
        <div class="wolf-card">
          <div class="wolf-card-in">
            <p class="wolf-install-step-tag">{{ step.num }} {{ step.name }}</p>
            <p class="wolf-install-cmd">
              <code>{{ step.cmd }}</code>
            </p>
            <p class="wolf-install-state">
              <span class="wolf-stamp">{{ step.state }}</span>
            </p>
            <p class="wolf-install-note">{{ step.note }}</p>
          </div>
        </div>
      </article>
    </div>
    <p class="wolf-install-note wolf-install-note-foot">
      {{
        t({
          en: 'Both paths continue with wolf bootstrap — starting memory from project documents. Try-out without installing: npx mister-wolf init — memory skeleton only, never writes MCP configs or the base set.',
          ru: 'Оба пути продолжаются wolf bootstrap — стартовая память из документов проекта. Попробовать без установки: npx mister-wolf init — только скелет памяти, никогда не пишет ни MCP-конфиги, ни базовый сет.',
        })
      }}
    </p>
  </section>
</template>

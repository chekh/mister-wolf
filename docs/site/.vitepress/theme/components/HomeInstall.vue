<script setup lang="ts">
import { computed } from 'vue';
import { useData } from 'vitepress';

type L = { en: string; ru: string };

const { lang } = useData();
const ru = computed(() => lang.value.startsWith('ru'));
const t = (s: L): string => (ru.value ? s.ru : s.en);

// Full OpenCode path first; memory-only use remains an explicit alternative.
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
    name: 'OPENCODE',
    cmd: 'wolf init --full --platform opencode',
    state: 'AGENTS + MEMORY',
    note: t({
      en: 'Run in your project; installs the organization and its MCP configuration',
      ru: 'Выполните в проекте: организация и её MCP-конфигурация',
    }),
  },
  {
    num: '03',
    name: t({ en: 'INTRODUCE PROJECT', ru: 'ЗНАКОМСТВО С ПРОЕКТОМ' }),
    cmd: 'wolf bootstrap',
    state: 'DRAFTS FOR REVIEW',
    note: t({
      en: 'Document references and proposed conventions; review with Wolf after restarting OpenCode',
      ru: 'Ссылки на документы и черновики конвенций; обсудите с Wolf после перезапуска OpenCode',
    }),
  },
]);
</script>

<template>
  <section class="wolf-home-section wolf-install">
    <p class="wolf-home-label">{{ t({ en: '05 · INSTALL', ru: '05 · УСТАНОВКА' }) }}</p>
    <h2 class="wolf-home-title">
      {{ t({ en: 'Connect your project, then give Wolf a goal', ru: 'Подключите проект и поручите Wolf цель' }) }}
    </h2>
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
          en: 'Node.js 22/24 · macOS or Linux (glibc) · OpenCode with a configured model. Use exactly mister-wolf. Optional memory-only path: wolf init; try-out: npx mister-wolf init. Neither installs the full organization. See Getting Started for details.',
          ru: 'Node.js 22/24 · macOS или Linux (glibc) · OpenCode с настроенной моделью. Имя пакета — mister-wolf. Режим только памяти: wolf init; пробный запуск: npx mister-wolf init. Полную организацию они не устанавливают. Подробности — в начале работы.',
        })
      }}
    </p>
  </section>
</template>

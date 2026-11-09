<script setup lang="ts">
import { computed } from 'vue';
import { useData } from 'vitepress';

type L = { en: string; ru: string };

const { lang } = useData();
const ru = computed(() => lang.value.startsWith('ru'));
const t = (s: L): string => (ru.value ? s.ru : s.en);

// Session copy; LESSON/ACCEPTED marks live in the memory object (system marks, EN)
const discover = computed(() =>
  t({
    en: 'A task leaves a checked result, decisions and the recorded next step. A supported complaint identifies a method that needs changing.',
    ru: 'После задачи остаются проверенный результат, решения и записанный следующий шаг. Обоснованная жалоба указывает методику, которую нужно изменить.',
  })
);

const inject = computed(() =>
  t({
    en: 'A later session receives relevant recorded state and the current face. It can continue from what was saved; unrecorded findings can still be lost.',
    ru: 'Следующая сессия получает относящееся состояние и актуальное лицо. Можно продолжить с сохранённого; незаписанные выводы всё ещё могут потеряться.',
  })
);
</script>

<template>
  <section id="sessions" class="wolf-home-section wolf-sessions">
    <p class="wolf-home-label">
      {{ t({ en: '02 · CONTINUITY AND LEARNING', ru: '02 · ПРЕЕМСТВЕННОСТЬ И ОБУЧЕНИЕ' }) }}
    </p>
    <h2 class="wolf-home-title">
      {{ t({ en: 'Two sessions, one organization', ru: 'Две сессии — одна организация' }) }}
    </h2>
    <div class="wolf-sessions-flow">
      <div class="wolf-sessions-col">
        <span class="wolf-sessions-node" aria-hidden="true" />
        <article class="wolf-card">
          <div class="wolf-card-in">
            <p class="wolf-session-tag">SESSION 01 · RESULT</p>
            <p class="wolf-session-text">{{ discover }}</p>
          </div>
        </article>
      </div>
      <div class="wolf-sessions-col">
        <span class="wolf-sessions-node is-filled" aria-hidden="true" />
        <!-- the memory object itself — a stored file, not a card -->
        <div class="wolf-memobj">
          <p class="wolf-memobj-head">
            <span class="wolf-memobj-type">STEWARD</span>
            <span class="wolf-memobj-status">METHOD UPDATE</span>
          </p>
          <p class="wolf-memobj-id">{{ ru ? 'Опыт → новая версия лица' : 'Experience → a new face version' }}</p>
          <p class="wolf-memobj-path">
            {{ ru ? 'Причина · проверка · история · откат' : 'Reason · validation · history · rollback' }}
          </p>
        </div>
      </div>
      <div class="wolf-sessions-col">
        <span class="wolf-sessions-node" aria-hidden="true" />
        <article class="wolf-card">
          <div class="wolf-card-in">
            <p class="wolf-session-tag">SESSION 02 · CONTINUE</p>
            <p class="wolf-session-text">{{ inject }}</p>
          </div>
        </article>
      </div>
    </div>
    <p class="wolf-sessions-takeaway">
      {{
        t({
          en: 'Recorded state supports continuity. Method changes follow an authorized process, not an automatic guarantee of improvement; the Steward that applies them is temporarily paused in 3.0.0 and returns in the next release.',
          ru: 'Записанное состояние сохраняет преемственность. Изменения методик проходят авторизованный процесс, а не гарантируют улучшение автоматически; Стюард, применяющий их, в 3.0.0 временно отключён и вернётся в следующем релизе.',
        })
      }}
    </p>
  </section>
</template>

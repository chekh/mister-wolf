<script setup lang="ts">
import { computed } from 'vue';
import { useData } from 'vitepress';
const { lang } = useData();
const ru = computed(() => lang.value.startsWith('ru'));
</script>

<template>
  <div class="wolf-terminal">
    <div class="wolf-terminal-bar">
      <span class="dot dot-signal" /><span class="dot dot-brass" /><span class="dot dot-verified" />
      <span class="wolf-terminal-title">{{
        ru ? 'Пример диалога · не фактический прогон' : 'Illustrative dialogue · not a recorded run'
      }}</span>
    </div>
    <div class="wolf-terminal-body">
      <p class="wolf-terminal-cmd">
        {{
          ru
            ? 'Вы: Подготовь руководство новому участнику проекта.'
            : 'You: Prepare a guide for a newcomer to the project.'
        }}
      </p>
      <p>
        {{
          ru
            ? 'Wolf: Используем документы проекта. Уточним, что нужно новичку, проверим шаги запуска и отметим открытые вопросы.'
            : 'Wolf: We will use the project documents, clarify what a newcomer needs, verify setup steps and identify open questions.'
        }}
      </p>
      <p class="wolf-terminal-result">
        {{
          ru
            ? 'Цель → организация работы → проверенный результат → сохранённый опыт'
            : 'Goal → organized work → checked result → retained experience'
        }}
      </p>
    </div>
  </div>
</template>

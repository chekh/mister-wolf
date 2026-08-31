<script setup lang="ts">
import { useData, withBase } from 'vitepress'

const { lang } = useData()
</script>

<template>
  <section class="wolf-home-section wolf-keyart">
    <p class="wolf-home-label">SUBJECT · MR.WOLF</p>
    <div class="wolf-keyart-frame">
      <img :src="withBase('/logo.png')" alt="Mr. Wolf — retro noir portrait" />
    </div>
    <blockquote class="wolf-keyart-quote">
      <!-- The character's voice: always EN; RU locale gets a small subtitle -->
      <p class="wolf-keyart-quote-en">&ldquo;I solve problems. But first, I remember how we solved them last time.&rdquo;</p>
      <p v-if="lang.startsWith('ru')" class="wolf-keyart-quote-ru">Я решаю проблемы. Но сначала я помню, как мы решали их в прошлый раз.</p>
    </blockquote>
  </section>
</template>

<script setup lang="ts">
import DefaultTheme from 'vitepress/theme-without-fonts'
import HeroTerminal from './components/HeroTerminal.vue'
import TrustBar from './components/TrustBar.vue'
</script>

<template>
  <DefaultTheme.Layout>
    <template #home-hero-image>
      <HeroTerminal />
    </template>
    <template #home-hero-after>
      <TrustBar />
    </template>
  </DefaultTheme.Layout>
</template>

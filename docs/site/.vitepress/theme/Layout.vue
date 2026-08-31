<script setup lang="ts">
import DefaultTheme from 'vitepress/theme-without-fonts'
import HomeHero from './components/HomeHero.vue'
import TrustBar from './components/TrustBar.vue'
import HomeWhy from './components/HomeWhy.vue'
import HomeSessions from './components/HomeSessions.vue'
import HomeLayers from './components/HomeLayers.vue'
import HomeModes from './components/HomeModes.vue'
import HomeInstall from './components/HomeInstall.vue'
import HomeFinalCTA from './components/HomeFinalCTA.vue'
</script>

<template>
  <DefaultTheme.Layout>
    <template #home-hero-before>
      <HomeHero />
    </template>
    <template #home-hero-after>
      <TrustBar />
      <HomeWhy />
    </template>
    <template #home-features-after>
      <HomeSessions />
      <HomeLayers />
      <HomeModes />
      <HomeInstall />
      <HomeFinalCTA />
    </template>
  </DefaultTheme.Layout>
</template>

<script setup lang="ts">
import DefaultTheme from 'vitepress/theme-without-fonts'
import HeroTerminal from './components/HeroTerminal.vue'
import TrustBar from './components/TrustBar.vue'
import HomeLayers from './components/HomeLayers.vue'
import HomeSessions from './components/HomeSessions.vue'
import HomeModes from './components/HomeModes.vue'
import HomeInstall from './components/HomeInstall.vue'
import HomeKeyArt from './components/HomeKeyArt.vue'
</script>

<template>
  <DefaultTheme.Layout>
    <template #home-hero-image>
      <HeroTerminal />
    </template>
    <template #home-hero-after>
      <TrustBar />
    </template>
    <template #home-features-after>
      <HomeLayers />
      <HomeSessions />
      <HomeModes />
      <HomeInstall />
      <HomeKeyArt />
    </template>
  </DefaultTheme.Layout>
</template>

<script setup lang="ts">
const stamps = ['LOCAL-FIRST', 'NO CLOUD', 'MCP-NATIVE', 'HUMAN-READABLE', 'VERSIONED']
</script>

<template>
  <div class="wolf-trust-bar" aria-label="Trust marks">
    <template v-for="(stamp, i) in stamps" :key="stamp">
      <span class="wolf-stamp" :class="{ 'wolf-stamp-even': i % 2 === 1 }">{{ stamp }}</span>
      <span v-if="i < stamps.length - 1" class="wolf-trust-sep" aria-hidden="true">&middot;</span>
    </template>
  </div>
</template>

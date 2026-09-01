<script setup lang="ts">
/**
 * WolfObject: memory-object card for doc pages — the dark mono plate from
 * the home page (.wolf-memobj geometry, home.css) with a status glyph.
 * Type/status are system marks: always EN, no locale.
 */
const STATUS: Record<string, { glyph: string; cls: string }> = {
  active: { glyph: '──●', cls: 'wg-active' },
  accepted: { glyph: '──✓', cls: 'wg-verified' },
  proposed: { glyph: '──◆', cls: 'wg-proposed' },
  candidate: { glyph: '──◆', cls: 'wg-proposed' },
  open: { glyph: '──×', cls: 'wg-blocked' },
  stale: { glyph: '──○', cls: 'wg-stale' },
  archived: { glyph: '──□', cls: 'wg-archived' },
  conflicting: { glyph: '●╱●', cls: 'wg-conflict' },
  superseded: { glyph: '○──●', cls: 'wg-superseded' },
  resolved: { glyph: '──✓', cls: 'wg-verified' },
  completed: { glyph: '──✓', cls: 'wg-verified' },
  answered: { glyph: '──✓', cls: 'wg-verified' },
  paused: { glyph: '──', cls: 'wg-archived' },
  rejected: { glyph: '──', cls: 'wg-archived' },
  obsolete: { glyph: '──', cls: 'wg-archived' },
  deprecated: { glyph: '──', cls: 'wg-archived' },
}

defineProps<{
  type: string
  status: string
  id?: string
  note?: string
}>()
</script>

<template>
  <div class="wolf-memobj wolf-obj">
    <p class="wolf-memobj-head">
      <span class="wolf-memobj-type">{{ type.toUpperCase() }}</span>
      <span class="wolf-memobj-status" :class="STATUS[status]?.cls">
        <span v-if="status === 'superseded'" class="wolf-glyph" aria-hidden="true"><span class="wg-old">○──</span><span class="wg-new">●</span></span>
        <span v-else class="wolf-glyph" aria-hidden="true">{{ STATUS[status]?.glyph }}</span>
        {{ status.toUpperCase() }}
      </span>
    </p>
    <p v-if="id" class="wolf-memobj-id">{{ id }}</p>
    <p v-if="note" class="wolf-memobj-path">{{ note }}</p>
    <div class="wolf-obj-body">
      <slot />
    </div>
  </div>
</template>

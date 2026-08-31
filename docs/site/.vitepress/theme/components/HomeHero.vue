<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useData, withBase } from 'vitepress'
import HeroTerminal from './HeroTerminal.vue'

type L = { en: string; ru: string }

const { lang } = useData()
const ru = lang.value.startsWith('ru')
const t = (s: L): string => (ru ? s.ru : s.en)

// Terminal overlap: pin the terminal to the portrait's bottom edge (35px
// overlap, the masked fade zone — face/cup stay visible). CSS %/transform
// drifts because grid row heights differ per locale; JS anchor is exact.
// No-JS fallback: grid row 5 placement (terminal below portrait, still fine).
const figureImg = ref<HTMLImageElement | null>(null)
const terminal = ref<{ $el: HTMLElement } | null>(null)

onMounted(() => {
  const apply = () => {
    const img = figureImg.value
    const termEl = terminal.value?.$el
    if (!img || !termEl) return
    // measure the BASE position: clear any previous translate first,
    // otherwise repeated apply() compounds/cancels the offset
    termEl.style.transform = ''
    if (!window.matchMedia('(min-width: 961px)').matches) return
    const hero = img.closest('.wolf-hero') as HTMLElement | null
    if (!hero) return
    const heroTop = hero.getBoundingClientRect().top
    const imgBottom = img.getBoundingClientRect().bottom - heroTop
    const termTop = termEl.getBoundingClientRect().top - heroTop
    // 20px overlap: the portrait's dissolving bottom edge only — the wolf's
    // paws/collar zone above stays uncovered
    termEl.style.transform = `translateY(${(imgBottom - 20 - termTop).toFixed(1)}px)`
  }
  apply()
  window.addEventListener('resize', apply)
  document.fonts?.ready.then(apply)
})
</script>

<template>
  <section class="wolf-hero">
    <div class="wolf-hero-grid">
      <p class="wolf-hero-label">PROJECT MEMORY · LOCAL-FIRST</p>
      <h1 class="wolf-hero-title">
        {{ t({ en: 'Agents forget.', ru: 'Агенты забывают.' }) }}<br />{{
          t({ en: "Mr. Wolf doesn't.", ru: 'Mr. Wolf — нет.' })
        }}
      </h1>
      <div class="wolf-hero-figure">
        <picture>
          <source type="image/webp" :srcset="withBase('/mark/wolf-portrait.webp')" />
          <img
            ref="figureImg"
            :src="withBase('/mark/wolf-portrait.png')"
            alt="Mr. Wolf — portrait"
          />
        </picture>
      </div>
      <p class="wolf-hero-sub">{{
        t({
          en: 'Project memory that outlives the session.',
          ru: 'Память проекта, которая переживает сессию.'
        })
      }}</p>
      <blockquote class="wolf-hero-statement">
        <p class="wolf-stmt-label">SUBJECT STATEMENT</p>
        <p class="wolf-stmt-quote">&ldquo;I solve problems. But first, I remember.&rdquo;</p>
        <p v-if="ru" class="wolf-stmt-quote-ru">Я решаю проблемы. Но сначала я помню.</p>
      </blockquote>
      <div class="wolf-hero-actions">
        <a
          class="wolf-btn wolf-btn-brand"
          :href="withBase(t({ en: '/guide/getting-started', ru: '/ru/guide/getting-started' }))"
        >{{ t({ en: 'Get Started', ru: 'Начать работу' }) }}</a>
        <a
          class="wolf-btn wolf-btn-alt"
          :href="withBase(t({ en: '/guide/cli', ru: '/ru/guide/cli' }))"
        >{{ t({ en: 'CLI Reference', ru: 'Справочник CLI' }) }}</a>
      </div>
      <HeroTerminal ref="terminal" />
    </div>
  </section>
</template>

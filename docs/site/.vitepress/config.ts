import { defineConfig } from 'vitepress'

// Site URL — head links need the absolute base (VitePress does not apply
// `base` to head entries, lesson mem_20260831_..._0d17a7).
const SITE_URL = 'https://chekh.github.io/mister-wolf/'

const cliItems = [
  { text: 'Command Index', link: '/guide/cli/' },
  { text: 'Overview', link: '/guide/cli/overview' },
  { text: 'Memory', link: '/guide/cli/memory' },
  { text: 'Sessions & Context', link: '/guide/cli/sessions-context' },
  { text: 'Work Management', link: '/guide/cli/work-management' },
  { text: 'Thinking & Council', link: '/guide/cli/thinking-council' },
  { text: 'Learning', link: '/guide/cli/learning' },
  { text: 'Platform & Maintenance', link: '/guide/cli/platform' },
]

const ruCliItems = [
  { text: 'Индекс команд', link: '/ru/guide/cli/' },
  { text: 'Обзор', link: '/ru/guide/cli/overview' },
  { text: 'Память', link: '/ru/guide/cli/memory' },
  { text: 'Сессии и контекст', link: '/ru/guide/cli/sessions-context' },
  { text: 'Управление работой', link: '/ru/guide/cli/work-management' },
  { text: 'Мышление и совет', link: '/ru/guide/cli/thinking-council' },
  { text: 'Самообучение', link: '/ru/guide/cli/learning' },
  { text: 'Платформа и обслуживание', link: '/ru/guide/cli/platform' },
]

export default defineConfig({
  title: 'Mr. Wolf',
  description: 'Local-first project memory for AI coding agents.',
  base: '/mister-wolf/',
  // VitePress does not apply `base` to head links — hardcode it for GitHub Pages
  head: [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: '/mister-wolf/mark/favicon.svg' }],
    ['link', { rel: 'icon', type: 'image/png', sizes: '64x64', href: '/mister-wolf/mark/trace-mark-a.png' }],
    // LCP: preload the hero emblem (base hardcoded — see lesson above)
    ['link', { rel: 'preload', as: 'image', href: '/mister-wolf/mark/wolf-emblem.webp', fetchpriority: 'high' }],
    // Social metadata (absolute URLs required by OG/Twitter crawlers)
    ['meta', { property: 'og:site_name', content: 'Mr. Wolf' }],
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:title', content: 'Mr. Wolf — Local-first project memory for AI coding agents' }],
    ['meta', { property: 'og:description', content: 'Agents forget. Mr. Wolf doesn\'t. Local-first memory for continuous agent work — CLI + MCP.' }],
    ['meta', { property: 'og:image', content: `${SITE_URL}mark/og-image.png` }],
    ['meta', { property: 'og:url', content: SITE_URL }],
    ['meta', { name: 'twitter:card', content: 'summary_large_image' }],
    ['meta', { name: 'twitter:title', content: 'Mr. Wolf — Local-first project memory for AI coding agents' }],
    ['meta', { name: 'twitter:description', content: 'Agents forget. Mr. Wolf doesn\'t. Local-first memory for continuous agent work — CLI + MCP.' }],
    ['meta', { name: 'twitter:image', content: `${SITE_URL}mark/og-image.png` }],
    ['link', { rel: 'canonical', href: SITE_URL }],
  ],
  locales: {
    root: {
      label: 'English',
      lang: 'en',
      themeConfig: {
        nav: [
          { text: 'Guide', link: '/guide/getting-started', activeMatch: '/guide/' },
          { text: 'CLI', link: '/guide/cli/' },
          { text: 'MCP', link: '/guide/mcp' },
          { text: 'Config', link: '/guide/configuration' },
        ],
        sidebar: [
          {
            text: 'START',
            items: [{ text: 'Getting Started', link: '/guide/getting-started' }],
          },
          {
            text: 'CONCEPTS',
            items: [{ text: 'Core Concepts', link: '/guide/core-concepts' }],
          },
          {
            text: 'CLI REFERENCE',
            items: cliItems,
          },
          {
            text: 'MCP',
            items: [{ text: 'MCP Integration', link: '/guide/mcp' }],
          },
          {
            text: 'OPERATE',
            items: [
              { text: 'Configuration', link: '/guide/configuration' },
              { text: 'Troubleshooting', link: '/guide/troubleshooting' },
            ],
          },
        ],
        socialLinks: [{ icon: 'github', link: 'https://github.com/chekh/mister-wolf' }],
      },
    },
    ru: {
      label: 'Русский',
      lang: 'ru',
      themeConfig: {
        nav: [
          { text: 'Руководство', link: '/ru/guide/getting-started', activeMatch: '/ru/guide/' },
          { text: 'CLI', link: '/ru/guide/cli/' },
          { text: 'MCP', link: '/ru/guide/mcp' },
          { text: 'Конфигурация', link: '/ru/guide/configuration' },
        ],
        sidebar: [
          {
            text: 'НАЧАЛО',
            items: [{ text: 'Начало работы', link: '/ru/guide/getting-started' }],
          },
          {
            text: 'КОНЦЕПЦИИ',
            items: [{ text: 'Основные концепции', link: '/ru/guide/core-concepts' }],
          },
          {
            text: 'СПРАВОЧНИК CLI',
            items: ruCliItems,
          },
          {
            text: 'MCP',
            items: [{ text: 'Интеграция MCP', link: '/ru/guide/mcp' }],
          },
          {
            text: 'ЭКСПЛУАТАЦИЯ',
            items: [
              { text: 'Конфигурация', link: '/ru/guide/configuration' },
              { text: 'Решение проблем', link: '/ru/guide/troubleshooting' },
            ],
          },
        ],
        socialLinks: [{ icon: 'github', link: 'https://github.com/chekh/mister-wolf' }],
      },
    },
  },
  themeConfig: {
    logo: '/mark/trace-mark-a.svg',
    search: { provider: 'local' },
  },
})

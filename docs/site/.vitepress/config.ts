import { defineConfig } from 'vitepress'

const guideItems = [
  { text: 'Getting Started', link: '/guide/getting-started' },
  { text: 'Core Concepts', link: '/guide/core-concepts' },
  { text: 'CLI Reference', link: '/guide/cli' },
  { text: 'MCP Integration', link: '/guide/mcp' },
  { text: 'Configuration', link: '/guide/configuration' },
  { text: 'Troubleshooting', link: '/guide/troubleshooting' },
]

const ruGuideItems = [
  { text: 'Начало работы', link: '/ru/guide/getting-started' },
  { text: 'Основные концепции', link: '/ru/guide/core-concepts' },
  { text: 'Справочник CLI', link: '/ru/guide/cli' },
  { text: 'Интеграция MCP', link: '/ru/guide/mcp' },
  { text: 'Конфигурация', link: '/ru/guide/configuration' },
  { text: 'Решение проблем', link: '/ru/guide/troubleshooting' },
]

export default defineConfig({
  title: 'Mr. Wolf',
  description: 'Local-first project memory for AI coding agents.',
  base: '/mister-wolf/',
  // VitePress does not apply `base` to head links — hardcode it for GitHub Pages
  head: [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: '/mister-wolf/mark/favicon.svg' }],
    ['link', { rel: 'icon', type: 'image/png', sizes: '64x64', href: '/mister-wolf/mark/trace-mark-a.png' }],
  ],
  locales: {
    root: {
      label: 'English',
      lang: 'en',
      themeConfig: {
        nav: [
          { text: 'Guide', link: '/guide/getting-started', activeMatch: '/guide/' },
          { text: 'CLI', link: '/guide/cli' },
          { text: 'MCP', link: '/guide/mcp' },
          { text: 'Config', link: '/guide/configuration' },
        ],
        sidebar: [{ text: 'Guide', items: guideItems }],
        socialLinks: [{ icon: 'github', link: 'https://github.com/chekh/mister-wolf' }],
      },
    },
    ru: {
      label: 'Русский',
      lang: 'ru',
      themeConfig: {
        nav: [
          { text: 'Руководство', link: '/ru/guide/getting-started', activeMatch: '/ru/guide/' },
          { text: 'CLI', link: '/ru/guide/cli' },
          { text: 'MCP', link: '/ru/guide/mcp' },
          { text: 'Конфигурация', link: '/ru/guide/configuration' },
        ],
        sidebar: [{ text: 'Руководство', items: ruGuideItems }],
        socialLinks: [{ icon: 'github', link: 'https://github.com/chekh/mister-wolf' }],
      },
    },
  },
  themeConfig: {
    logo: '/mark/trace-mark-a.svg',
    search: { provider: 'local' },
  },
})

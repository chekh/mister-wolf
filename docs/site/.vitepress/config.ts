import { defineConfig } from 'vitepress';
import pkg from '../../../package.json' with { type: 'json' };

// Site URL — head links need the absolute base (VitePress does not apply
// `base` to head entries, lesson mem_20260831_..._0d17a7).
const SITE_URL = 'https://chekh.github.io/mister-wolf/';

// Version badge in the navbar — single source of truth: package.json
// (rule: ведение версий). Updates automatically on every release.
const VERSION_NAV = {
  text: `v${pkg.version}`,
  link: 'https://github.com/chekh/mister-wolf/releases',
  activeMatch: 'x-nomatch-x',
};

const cliItems = [
  { text: 'Command Index', link: '/guide/cli/' },
  { text: 'Overview', link: '/guide/cli/overview' },
  { text: 'Memory', link: '/guide/cli/memory' },
  { text: 'Sessions & Context', link: '/guide/cli/sessions-context' },
  { text: 'Work Management', link: '/guide/cli/work-management' },
  { text: 'Thinking', link: '/guide/cli/thinking-council' },
  { text: 'Analytics', link: '/guide/cli/analytics' },
  { text: 'Platform & Maintenance', link: '/guide/cli/platform' },
];

const ruCliItems = [
  { text: 'Индекс команд', link: '/ru/guide/cli/' },
  { text: 'Обзор', link: '/ru/guide/cli/overview' },
  { text: 'Память', link: '/ru/guide/cli/memory' },
  { text: 'Сессии и контекст', link: '/ru/guide/cli/sessions-context' },
  { text: 'Управление работой', link: '/ru/guide/cli/work-management' },
  { text: 'Мышление', link: '/ru/guide/cli/thinking-council' },
  { text: 'Аналитика', link: '/ru/guide/cli/analytics' },
  { text: 'Платформа и обслуживание', link: '/ru/guide/cli/platform' },
];

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
    [
      'meta',
      {
        property: 'og:description',
        content: "Agents forget. Mr. Wolf doesn't. Local-first memory for continuous agent work — CLI + MCP.",
      },
    ],
    ['meta', { property: 'og:image', content: `${SITE_URL}mark/og-image.png` }],
    ['meta', { property: 'og:url', content: SITE_URL }],
    ['meta', { name: 'twitter:card', content: 'summary_large_image' }],
    ['meta', { name: 'twitter:title', content: 'Mr. Wolf — Local-first project memory for AI coding agents' }],
    [
      'meta',
      {
        name: 'twitter:description',
        content: "Agents forget. Mr. Wolf doesn't. Local-first memory for continuous agent work — CLI + MCP.",
      },
    ],
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
          VERSION_NAV,
        ],
        sidebar: [
          {
            text: 'START',
            items: [{ text: 'Getting Started', link: '/guide/getting-started' }],
          },
          {
            text: 'CONCEPTS',
            items: [
              { text: 'Core Concepts', link: '/guide/core-concepts' },
              { text: 'Memory Model', link: '/guide/memory' },
              { text: 'Feedback Loop', link: '/guide/feedback' },
              { text: 'Steward Aggregation', link: '/guide/steward' },
              { text: 'Router', link: '/guide/router' },
            ],
          },
          {
            text: 'CLI REFERENCE',
            items: cliItems,
          },
          {
            text: 'BASE SET',
            items: [{ text: 'Base Set', link: '/guide/base-set' }],
          },
          {
            text: 'MCP',
            items: [{ text: 'MCP Integration', link: '/guide/mcp' }],
          },
          {
            text: 'OPERATE',
            items: [
              { text: 'Configuration', link: '/guide/configuration' },
              { text: 'Transfer & Multi-Project', link: '/guide/transfer' },
              { text: 'Migration to 2.13', link: '/guide/migration-2.13' },
              { text: 'Telemetry', link: '/guide/telemetry' },
              { text: 'Troubleshooting', link: '/guide/troubleshooting' },
            ],
          },
          {
            text: 'CHANGELOG',
            items: [{ text: 'Changelog', link: '/changelog/' }],
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
          VERSION_NAV,
        ],
        sidebar: [
          {
            text: 'НАЧАЛО',
            items: [{ text: 'Начало работы', link: '/ru/guide/getting-started' }],
          },
          {
            text: 'КОНЦЕПЦИИ',
            items: [
              { text: 'Основные концепции', link: '/ru/guide/core-concepts' },
              { text: 'Модель памяти', link: '/ru/guide/memory' },
              { text: 'Контур поправок', link: '/ru/guide/feedback' },
              { text: 'Агрегация Стюарда', link: '/ru/guide/steward' },
              { text: 'Роутер', link: '/ru/guide/router' },
            ],
          },
          {
            text: 'СПРАВОЧНИК CLI',
            items: ruCliItems,
          },
          {
            text: 'БАЗОВЫЙ НАБОР',
            items: [{ text: 'Базовый набор', link: '/ru/guide/base-set' }],
          },
          {
            text: 'MCP',
            items: [{ text: 'Интеграция MCP', link: '/ru/guide/mcp' }],
          },
          {
            text: 'ЭКСПЛУАТАЦИЯ',
            items: [
              { text: 'Конфигурация', link: '/ru/guide/configuration' },
              { text: 'Перенос и мультипроектность', link: '/ru/guide/transfer' },
              { text: 'Миграция на 2.13', link: '/ru/guide/migration-2.13' },
              { text: 'Телеметрия', link: '/ru/guide/telemetry' },
              { text: 'Решение проблем', link: '/ru/guide/troubleshooting' },
            ],
          },
          {
            text: 'CHANGELOG',
            items: [{ text: 'История версий', link: '/ru/changelog/' }],
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
});

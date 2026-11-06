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
  { text: 'Command Reference', link: '/guide/cli/command-reference' },
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
  { text: 'Справочник команд', link: '/ru/guide/cli/command-reference' },
];

export default defineConfig({
  title: 'Mr. Wolf',
  description:
    'Mr. Wolf organizes AI assistants around your goal: connected processes, project memory, governed learning through the Steward and clear human communication. Local-first, OpenCode-first.',
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
    ['meta', { property: 'og:title', content: 'Mr. Wolf — a permanent project organization for temporary AI agents' }],
    [
      'meta',
      {
        property: 'og:description',
        content: "Agents are temporary. Your project's organization isn't. Local-first, CLI + MCP.",
      },
    ],
    ['meta', { property: 'og:image', content: `${SITE_URL}mark/og-image.png` }],
    ['meta', { property: 'og:url', content: SITE_URL }],
    ['meta', { name: 'twitter:card', content: 'summary_large_image' }],
    ['meta', { name: 'twitter:title', content: 'Mr. Wolf — a permanent project organization for temporary AI agents' }],
    [
      'meta',
      {
        name: 'twitter:description',
        content: "Agents are temporary. Your project's organization isn't. Local-first, CLI + MCP.",
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
          { text: 'Guide', link: '/guide/overview', activeMatch: '/guide/' },
          { text: 'CLI', link: '/guide/cli/' },
          { text: 'MCP', link: '/guide/mcp' },
          { text: 'Config', link: '/guide/configuration' },
          VERSION_NAV,
        ],
        sidebar: [
          {
            text: 'START HERE',
            items: [
              { text: 'What is Wolf?', link: '/guide/overview' },
              { text: 'Capabilities & Comparison', link: '/guide/capabilities' },
              { text: 'Your First Task', link: '/guide/getting-started' },
              { text: 'Working with Wolf', link: '/guide/working-with-wolf' },
              { text: 'Introduce Your Project', link: '/guide/bootstrap' },
            ],
          },
          {
            text: 'WHY WOLF',
            items: [
              { text: 'Goal & Responsibility', link: '/guide/organization' },
              { text: 'Architecture', link: '/guide/architecture' },
            ],
          },
          {
            text: 'CONCEPTS',
            items: [
              { text: 'Memory Model', link: '/guide/memory' },
              { text: 'Steward & Learning', link: '/guide/feedback' },
              { text: 'Reusable Tools', link: '/guide/tool-economy' },
              { text: 'Delivery & Trust', link: '/guide/delivery' },
              { text: 'Read Isolation', link: '/guide/read-isolation' },
              { text: 'Expert Council', link: '/guide/council' },
            ],
          },
          {
            text: 'PIPELINE',
            items: [
              { text: 'Artifact Pipeline', link: '/guide/artifact-pipeline' },
              { text: 'Skill Intake', link: '/guide/skill-intake' },
            ],
          },
          {
            text: 'BASE SET',
            items: [{ text: 'Base Set', link: '/guide/base-set' }],
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
              { text: 'Upgrading', link: '/guide/upgrade' },
              { text: 'Configuration', link: '/guide/configuration' },
              { text: 'Transfer & Multi-Project', link: '/guide/transfer' },
              { text: 'Migration to 2.13 (historical)', link: '/guide/migration-2.13' },
              { text: 'Analytics', link: '/guide/analytics' },
              { text: 'Harness Integration', link: '/guide/harness-integration' },
              { text: 'Maintaining Docs', link: '/guide/documentation' },
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
      description:
        'Mr. Wolf организует AI-помощников вокруг вашей цели: связанные процессы, память проекта, управляемое обучение через Стюарда и понятное общение с человеком. Local-first, OpenCode-first.',
      themeConfig: {
        nav: [
          { text: 'Руководство', link: '/ru/guide/overview', activeMatch: '/ru/guide/' },
          { text: 'CLI', link: '/ru/guide/cli/' },
          { text: 'MCP', link: '/ru/guide/mcp' },
          { text: 'Конфигурация', link: '/ru/guide/configuration' },
          VERSION_NAV,
        ],
        sidebar: [
          {
            text: 'НАЧНИТЕ ЗДЕСЬ',
            items: [
              { text: 'Что такое Wolf', link: '/ru/guide/overview' },
              { text: 'Возможности и сравнение', link: '/ru/guide/capabilities' },
              { text: 'Первая задача', link: '/ru/guide/getting-started' },
              { text: 'Работа с Wolf', link: '/ru/guide/working-with-wolf' },
              { text: 'Знакомство с проектом', link: '/ru/guide/bootstrap' },
            ],
          },
          {
            text: 'ПОЧЕМУ WOLF',
            items: [
              { text: 'Цель и ответственность', link: '/ru/guide/organization' },
              { text: 'Архитектура', link: '/ru/guide/architecture' },
            ],
          },
          {
            text: 'КОНЦЕПЦИИ',
            items: [
              { text: 'Модель памяти', link: '/ru/guide/memory' },
              { text: 'Стюард и обучение', link: '/ru/guide/feedback' },
              { text: 'Инструменты проекта', link: '/ru/guide/tool-economy' },
              { text: 'Доставка и доверие', link: '/ru/guide/delivery' },
              { text: 'Изоляция чтения', link: '/ru/guide/read-isolation' },
              { text: 'Экспертный консилиум', link: '/ru/guide/council' },
            ],
          },
          {
            text: 'КОНВЕЙЕР',
            items: [
              { text: 'Конвейер артефактов', link: '/ru/guide/artifact-pipeline' },
              { text: 'Подключение скиллов', link: '/ru/guide/skill-intake' },
            ],
          },
          {
            text: 'БАЗОВЫЙ НАБОР',
            items: [{ text: 'Базовый набор', link: '/ru/guide/base-set' }],
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
              { text: 'Обновление', link: '/ru/guide/upgrade' },
              { text: 'Конфигурация', link: '/ru/guide/configuration' },
              { text: 'Перенос и мультипроектность', link: '/ru/guide/transfer' },
              { text: 'Миграция на 2.13 (historical)', link: '/ru/guide/migration-2.13' },
              { text: 'Аналитика', link: '/ru/guide/analytics' },
              { text: 'Интеграция харнесов', link: '/ru/guide/harness-integration' },
              { text: 'Поддержание документации', link: '/ru/guide/documentation' },
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

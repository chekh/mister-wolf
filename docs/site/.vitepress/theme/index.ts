import type { Theme } from 'vitepress'
import DefaultTheme from 'vitepress/theme-without-fonts'
import Layout from './Layout.vue'

// Self-hosted fonts (no external requests). Latin + cyrillic subsets.
// ponytail: ibm-plex-sans-condensed has NO base cyrillic subset (font itself
// is latin-only) — RU headings fall back to IBM Plex Sans via font stack.
import '@fontsource/ibm-plex-sans/400.css'
import '@fontsource/ibm-plex-sans/500.css'
import '@fontsource/ibm-plex-sans/600.css'
import '@fontsource/ibm-plex-sans/700.css'
import '@fontsource/ibm-plex-sans/cyrillic-400.css'
import '@fontsource/ibm-plex-sans/cyrillic-500.css'
import '@fontsource/ibm-plex-sans/cyrillic-600.css'
import '@fontsource/ibm-plex-sans/cyrillic-700.css'

import '@fontsource/ibm-plex-sans-condensed/600.css'
import '@fontsource/ibm-plex-sans-condensed/700.css'

import '@fontsource/ibm-plex-mono/400.css'
import '@fontsource/ibm-plex-mono/500.css'
import '@fontsource/ibm-plex-mono/cyrillic-400.css'
import '@fontsource/ibm-plex-mono/cyrillic-500.css'

import './styles/tokens.css'
import './styles/base.css'
import './styles/home.css'
import './styles/docs.css'
import './styles/code.css'

export default {
  extends: DefaultTheme,
  Layout,
} satisfies Theme

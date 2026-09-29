#!/usr/bin/env node
// Синк CHANGELOG.md → docs/site/changelog/index.md (правило mem_20260929_..._c0ac8b):
// docs:build копирует CHANGELOG на сайт без ручного дублирования. Тело — дословная
// копия, шапка — только VitePress-фронтматтер; вывод скрипта prettier-чист.
// {{ экранируется HTML-entity: Vue парсит интерполяции даже в inline-code
// (`{{model.*}}` в истории 2.11 валил docs:build), браузер рисует те же {{.
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const source = join(repoRoot, 'CHANGELOG.md');
const target = join(repoRoot, 'docs/site/changelog/index.md');

const changelog = readFileSync(source, 'utf8').replace(/\n+$/, '\n').replaceAll('{{', '&#123;&#123;');
mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, `---\ntitle: Changelog\n---\n\n${changelog}`);

const { size } = statSync(target);
console.log(`sync-changelog: ${target} (${size} bytes)`);

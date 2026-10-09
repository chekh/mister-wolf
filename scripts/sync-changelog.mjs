#!/usr/bin/env node
// Синк CHANGELOG.md → docs/site/changelog/index.md (правило mem_20260929_..._c0ac8b):
// docs:build копирует CHANGELOG на сайт без ручного дублирования. Тело — дословная
// копия, шапка — только VitePress-фронтматтер; вывод прогоняется через prettier —
// дословная копия не всегда prettier-чиста (напр. `council-*` в 2.15.1 требовал
// экранирования), а format:check гоняет docs/**/*.md.
// {{ экранируется HTML-entity: Vue парсит интерполяции даже в inline-code
// (`{{model.*}}` в истории 2.11 валил docs:build), браузер рисует те же {{.
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { format } from 'prettier';

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const source = join(repoRoot, 'CHANGELOG.md');
const target = join(repoRoot, 'docs/site/changelog/index.md');

const changelog = readFileSync(source, 'utf8').replace(/\n+$/, '\n').replaceAll('{{', '&#123;&#123;');
mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, `---\ntitle: Changelog\n---\n\n${changelog}`);

// RU-зеркало: та же история версий (синхронно при каждой сборке), русская шапка.
// Тело остаётся на английском — как в npm/GitHub Releases; ручной перевод
// рассинхронизируется, машинальная копия — нет.
const ruTarget = join(repoRoot, 'docs/site/ru/changelog/index.md');
mkdirSync(dirname(ruTarget), { recursive: true });
writeFileSync(
  ruTarget,
  `---\ntitle: История версий\n---\n\nИстория версий синхронизируется автоматически из [CHANGELOG.md](https://github.com/chekh/mister-wolf/blob/main/CHANGELOG.md) при каждой сборке сайта. Описания изменений приведены на английском — в том же виде, что в npm и GitHub Releases.\n\n${changelog}`
);

// Prettier-нормализация вывода: генерат должен быть идемпотентен и проходить
// format:check без ручных правок (урок релиза 2.15.2: CI Publish упал на
// перегенерированной странице с нематчингом prettier).
for (const file of [target, ruTarget]) {
  writeFileSync(file, await format(readFileSync(file, 'utf8'), { filepath: file }));
}

const { size } = statSync(target);
console.log(`sync-changelog: ${target} (${size} bytes) + ru mirror`);

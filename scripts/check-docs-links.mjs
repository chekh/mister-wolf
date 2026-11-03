#!/usr/bin/env node
// Validate the rendered site so anchors use VitePress's actual slug rules.
// External links are deliberately not network-checked by this reproducible gate.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const option = process.argv.indexOf('--site-dir');
const dist = resolve(option < 0 ? join(root, 'docs/site/.vitepress/dist') : process.argv[option + 1]);
const base = '/mister-wolf/';
const origin = 'https://chekh.github.io';
const failures = new Set();
let checked = 0;
function walk(dir, extension) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path, extension) : path.endsWith(extension) ? [path] : [];
  });
}
function targetFile(path) {
  const clean = path.replace(/^\//, '');
  const file = join(dist, clean);
  if (existsSync(file) && statSync(file).isFile()) return file;
  if (!extname(file) && existsSync(`${file}.html`)) return `${file}.html`;
  if (existsSync(join(file, 'index.html'))) return join(file, 'index.html');
  return null;
}
function checkSiteLink(href, source) {
  if (!href || /^(?:mailto:|tel:|data:)/i.test(href)) return;
  const here = relative(dist, source).replaceAll('\\', '/');
  const url = new URL(href.replaceAll('&amp;', '&'), `${origin}${base}${here}`);
  if (url.origin !== origin || !url.pathname.startsWith(base)) return;
  checked++;
  const path = decodeURIComponent(url.pathname.slice(base.length));
  const target = targetFile(path);
  if (!target) {
    failures.add(`${here}: missing target ${href}`);
    return;
  }
  if (url.hash && target.endsWith('.html')) {
    const id = decodeURIComponent(url.hash.slice(1));
    const html = readFileSync(target, 'utf8');
    if (!html.includes(`id="${id}"`) && !html.includes(`name="${id}"`)) {
      failures.add(`${here}: missing anchor ${href}`);
    }
  }
}
if (!existsSync(join(dist, 'index.html'))) {
  console.error('docs-links: build the site first (npm run docs:build)');
  process.exit(1);
}
for (const file of walk(dist, '.html')) {
  const html = readFileSync(file, 'utf8');
  for (const match of html.matchAll(/\b(?:href|src)="([^"]+)"/g)) checkSiteLink(match[1], file);
}
// README and repository index: validate local paths and links to our site.
for (const name of ['README.md', 'README.ru.md', 'CONTRIBUTING.md', 'docs/README.md']) {
  const file = join(root, name);
  const text = readFileSync(file, 'utf8').replace(/```[^]*?```/g, '');
  for (const match of text.matchAll(/\]\(([^\s)]+)\)/g)) {
    const href = match[1];
    if (href.startsWith(`${origin}${base}`)) checkSiteLink(href, join(dist, 'index.html'));
    else if (!/^(?:[a-z]+:|#)/i.test(href)) {
      checked++;
      const target = resolve(dirname(file), decodeURIComponent(href.split('#')[0]));
      if (!existsSync(target)) failures.add(`${name}: missing local target ${href}`);
    }
  }
}
const en = walk(join(root, 'docs/site/guide'), '.md')
  .map((p) => relative(join(root, 'docs/site/guide'), p))
  .sort();
const ru = walk(join(root, 'docs/site/ru/guide'), '.md')
  .map((p) => relative(join(root, 'docs/site/ru/guide'), p))
  .sort();
for (const path of new Set([...en, ...ru])) {
  if (!en.includes(path) || !ru.includes(path)) failures.add(`EN/RU page missing: ${path}`);
}
if (existsSync(join(root, 'docs/guide'))) failures.add('docs/guide must not duplicate the canonical website');
if (failures.size) {
  console.error(`docs-links: ${failures.size} issue(s)\n${[...failures].join('\n')}`);
  process.exit(1);
}
console.log(
  `docs-links: OK (${checked} local links/assets/anchors, ${en.length} EN/RU guide pairs; external URLs not checked)`
);

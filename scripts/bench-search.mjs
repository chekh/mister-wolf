#!/usr/bin/env node
// FTS5 keyword-search latency baseline for Mr.Wolf.
// Deterministic synthetic corpus in os.tmpdir(), fixed query mix, p50/p95 report.
// Run: npm run bench:search  (builds dist first, no extra deps)

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { SQLiteSearchIndex } from '../dist/adapters/sqlite/sqlite-search-index.js';
import { MEMORY_TYPES } from '../dist/domain/memory-types.js';

const SEED = 42;
const SIZES = [100, 1000, 10000];
const WARMUP = 5;
const RUNS = 50;

// --- deterministic PRNG (mulberry32) ---
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Vocabulary: common words + "hot" words shared across many objects
// (overlapping vocabulary is what makes keyword search non-trivial).
const COMMON_EN = [
  'service', 'worker', 'queue', 'config', 'schema', 'parser', 'client', 'server',
  'storage', 'adapter', 'domain', 'bootstrap', 'memory', 'object', 'store',
  'filter', 'report', 'review', 'status', 'import',
];
const COMMON_RU = [
  'сервис', 'воркер', 'очередь', 'настройка', 'схема', 'парсер', 'клиент',
  'сервер', 'хранилище', 'адаптер', 'домен', 'память', 'объект', 'фильтр',
  'отчёт', 'ревью', 'статус', 'импорт',
];
const HOT_EN = ['cache', 'retry', 'timeout', 'indexing', 'pipeline'];
const HOT_RU = ['кэширование', 'очистка', 'поиск', 'индексация', 'миграция'];
const TAG_POOL = [...HOT_EN, ...HOT_RU, 'bench', 'baseline', 'fts5', 'sqlite'];
// Fixed phrases appended to ~15% of bodies so multi-word (phrase) queries have hits at every size.
const PHRASES = ['retry timeout guard', 'очистка кэша вручную'];

const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];

function sentence(rng, lang) {
  const main = lang === 'en' ? COMMON_EN : COMMON_RU;
  const hot = lang === 'en' ? HOT_EN : HOT_RU;
  return `${pick(rng, main)} ${pick(rng, hot)} ${pick(rng, main)} ${pick(rng, hot)}`;
}

function makeObject(rng, i) {
  const lang = i % 2 === 0 ? 'en' : 'ru';
  const type = MEMORY_TYPES[i % MEMORY_TYPES.length];
  // Frequent-word class: ~60% of objects contain 'cache'.
  const hasFreq = rng() < 0.6;
  const title =
    lang === 'en'
      ? `${pick(rng, COMMON_EN)} ${pick(rng, HOT_EN)} ${type}`
      : `${pick(rng, COMMON_RU)} ${pick(rng, HOT_RU)} ${type}`;
  const body = [
    sentence(rng, lang),
    sentence(rng, lang),
    hasFreq ? `shared cache note ${i}` : sentence(rng, lang === 'en' ? 'ru' : 'en'),
    rng() < 0.15 ? pick(rng, PHRASES) : '',
  ]
    .filter(Boolean)
    .join('. ');
  return {
    id: `bench_${String(i).padStart(6, '0')}`,
    type,
    title,
    status: 'active',
    review_state: 'accepted',
    confidence: pick(rng, ['low', 'medium', 'high']),
    importance: Math.round(rng() * 100) / 100,
    created_at: new Date(1700000000000 + i * 60000).toISOString(),
    updated_at: new Date(1700000000000 + i * 60000 + 30000).toISOString(),
    created_by: 'bench',
    schema_version: 1,
    source: { kind: 'session', session_id: 'bench' },
    related: { files: [], docs: [], decisions: [] },
    tags: [pick(rng, TAG_POOL), pick(rng, TAG_POOL)],
    superseded_by: null,
    body,
    memory_class: 'working',
    truth_role: 'accepted_knowledge',
    lifetime: 'long_term',
  };
}

// Fixed query mix. Note: SQLiteSearchIndex quotes the whole query, so
// multi-word queries are FTS5 phrase queries — same as real `wolf search`.
const QUERY_MIX = [
  { cls: 'single-latin', query: 'parser' },
  { cls: 'multi-latin', query: 'retry timeout guard' },
  { cls: 'cyrillic-single', query: 'кэширование' },
  { cls: 'cyrillic-multi', query: 'очистка кэша вручную' },
  { cls: 'empty-result', query: 'zzzqqxynotfound' },
  { cls: 'frequent-word', query: 'cache' },
];

async function benchQuery(index, query) {
  for (let i = 0; i < WARMUP; i++) await index.search(query);
  const lat = [];
  let hits = 0;
  for (let i = 0; i < RUNS; i++) {
    const t0 = performance.now();
    const res = await index.search(query);
    lat.push(performance.now() - t0);
    hits = res.length;
  }
  lat.sort((a, b) => a - b);
  const pct = (p) => lat[Math.min(lat.length - 1, Math.ceil(p * lat.length) - 1)];
  return { p50: pct(0.5), p95: pct(0.95), hits };
}

console.log(`FTS5 keyword search baseline — seed=${SEED}, corpus in os.tmpdir(), ${RUNS} runs/query (+${WARMUP} warmup)`);
console.log('');
console.log(
  'corpus'.padEnd(7),
  'build(s)'.padStart(8),
  'class'.padEnd(16),
  'query'.padEnd(22),
  'hits'.padStart(6),
  'p50(ms)'.padStart(9),
  'p95(ms)'.padStart(9),
);

for (const size of SIZES) {
  const dir = mkdtempSync(join(tmpdir(), 'wolf-bench-'));
  try {
    const index = new SQLiteSearchIndex(join(dir, 'bench.db'));
    const rng = mulberry32(SEED); // fresh seeded rng per size -> identical corpus every run
    const objects = Array.from({ length: size }, (_, i) => makeObject(rng, i));
    const t0 = performance.now();
    await index.rebuild(objects);
    const buildS = ((performance.now() - t0) / 1000).toFixed(3);
    for (const { cls, query } of QUERY_MIX) {
      const { p50, p95, hits } = await benchQuery(index, query);
      console.log(
        String(size).padEnd(7),
        buildS.padStart(8),
        cls.padEnd(16),
        query.padEnd(22),
        String(hits).padStart(6),
        p50.toFixed(3).padStart(9),
        p95.toFixed(3).padStart(9),
      );
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
console.log('');
console.log('Done. Temp corpora removed.');

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

/**
 * Guard: онбординг-блок в корневом AGENTS.md обязан быть байт-в-байт равен
 * блоку из templates/base/AGENTS.md, а сам блок — оставаться валидным
 * markdown-списком. Класс дефекта, который ловится (dogfood 2.20.0):
 * продолжение пункта списка потеряло отступ в 2 пробела — блок остался
 * «валидным» для prettier, но список распался на абзац. Проверка глазами
 * такое не держит, поэтому guard.
 */
const OPEN = '<!-- wolf:onboarding v3 -->';
const CLOSE = '<!-- /wolf:onboarding -->';

function block(file: string): string {
  const text = readFileSync(join(process.cwd(), file), 'utf8');
  const start = text.indexOf(OPEN);
  const end = text.indexOf(CLOSE);
  expect(start, `${file}: маркер ${OPEN} не найден`).toBeGreaterThanOrEqual(0);
  expect(end, `${file}: маркер ${CLOSE} не найден`).toBeGreaterThan(start);
  return text.slice(start, end + CLOSE.length);
}

/** Продолжение пункта списка начинается с отступа, а не с нулевой колонки. */
function brokenContinuations(markdown: string): string[] {
  const listItem = /^(\s*)(?:\d+\.|[-*])\s/;
  const broken: string[] = [];
  let prev: string | null = null;
  for (const line of markdown.split('\n')) {
    const inList = prev !== null && listItem.test(prev);
    const startsItem = listItem.test(line);
    if (inList && line.trim() !== '' && !startsItem && !line.startsWith(' ') && !line.startsWith('#')) {
      broken.push(line);
    }
    if (line.trim() !== '') prev = line;
  }
  return broken;
}

describe('guard: onboarding block in AGENTS.md', () => {
  it('equals the template block byte-for-byte', () => {
    expect(block('AGENTS.md'), 'AGENTS.md разошёлся с templates/base/AGENTS.md — запустите wolf upgrade').toBe(
      block('templates/base/AGENTS.md')
    );
  });

  it('keeps list continuations indented (no broken markdown list)', () => {
    expect(brokenContinuations(block('templates/base/AGENTS.md')), 'продолжение пункта без отступа').toEqual([]);
  });
});

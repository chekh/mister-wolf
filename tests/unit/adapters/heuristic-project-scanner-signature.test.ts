import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, utimesSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { projectTreeSignature } from '../../../src/adapters/fs/heuristic-project-scanner.js';

// macOS: грубое разрешение dir mtime — гарантированный скачок через явный utimes в будущее
const FUTURE = new Date('2030-01-01T00:00:00Z');

describe('projectTreeSignature', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wolf-sig-'));
    mkdirSync(join(dir, 'src'));
    writeFileSync(join(dir, 'src', 'index.ts'), 'export {}');
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'sig-test' }));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('стабильна при повторном вызове', async () => {
    expect(await projectTreeSignature(dir)).toBe(await projectTreeSignature(dir));
  });

  it('меняется при создании нового файла (dir mtime)', async () => {
    const before = await projectTreeSignature(dir);
    writeFileSync(join(dir, 'src', 'new-file.ts'), 'export const x = 1;');
    utimesSync(join(dir, 'src'), FUTURE, FUTURE);
    expect(await projectTreeSignature(dir)).not.toBe(before);
  });

  it('меняется при mkdir', async () => {
    const before = await projectTreeSignature(dir);
    mkdirSync(join(dir, 'docs'));
    utimesSync(dir, FUTURE, FUTURE);
    expect(await projectTreeSignature(dir)).not.toBe(before);
  });

  it('НЕ меняется при контентной правке существующего файла', async () => {
    const before = await projectTreeSignature(dir);
    // правка меняет mtime ФАЙЛА, но не mtime каталога — сигнатура не должна ловить
    writeFileSync(join(dir, 'src', 'index.ts'), 'export const changed = true; // much longer content now');
    expect(await projectTreeSignature(dir)).toBe(before);
  });

  it('меняется при touch package.json', async () => {
    const before = await projectTreeSignature(dir);
    utimesSync(join(dir, 'package.json'), FUTURE, FUTURE);
    expect(await projectTreeSignature(dir)).not.toBe(before);
  });

  it('игнорирует node_modules', async () => {
    mkdirSync(join(dir, 'node_modules', 'dep'), { recursive: true });
    utimesSync(dir, FUTURE, FUTURE); // фиксируем root mtime после mkdir
    const before = await projectTreeSignature(dir);
    writeFileSync(join(dir, 'node_modules', 'dep', 'index.js'), 'module.exports = 1;');
    expect(await projectTreeSignature(dir)).toBe(before);
  });
});

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { scanJsonlFile } from '../../../src/adapters/fs/jsonl-scan.js';

describe('scanJsonlFile', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wolf-jsonl-scan-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('returns problems for broken lines and parses the rest', async () => {
    const path = join(dir, 'test.jsonl');
    writeFileSync(
      path,
      [
        JSON.stringify({
          id: '1',
          type: 'memory.added',
          timestamp: '2026-01-01T00:00:00Z',
          actor: 'test',
          payload: { memory_id: 'm1', type: 'decision' },
        }),
        '{bad json}',
        JSON.stringify({
          id: '2',
          type: 'memory.added',
          timestamp: '2026-01-01T00:00:00Z',
          actor: 'test',
          payload: { memory_id: 'm2', type: 'lesson' },
        }),
        JSON.stringify({ id: '3' }), // valid JSON but will fail type parse
      ].join('\n'),
      'utf-8'
    );

    const { items, problems } = await scanJsonlFile(path, (line, lineNum) => {
      const data = JSON.parse(line);
      if (!data.type) throw new Error('missing type');
      return data;
    });

    expect(items).toHaveLength(2);
    expect(problems).toHaveLength(2);
    expect(problems[0].line).toBe(2);
    expect(problems[1].line).toBe(4);
  });

  it('returns empty for missing file', async () => {
    const { items, problems } = await scanJsonlFile(join(dir, 'nonexistent.jsonl'), () => {
      throw new Error('no');
    });
    expect(items).toEqual([]);
    expect(problems).toEqual([]);
  });
});

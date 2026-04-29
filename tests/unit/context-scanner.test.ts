import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ContextScanner } from '../../src/context/scanner.js';
import { mkdtempSync, writeFileSync, mkdirSync, symlinkSync, rmSync, statSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { ContextConfig } from '../../src/config/project-config.js';
import { createHash } from 'crypto';

describe('ContextScanner', () => {
  let tempDir: string;
  let scanner: ContextScanner;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'wolf-scan-'));
    scanner = new ContextScanner();
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  function defaultConfig(overrides?: Partial<ContextConfig>): ContextConfig {
    return {
      include: ['**/*'],
      exclude: [],
      limits: {
        max_files: 100,
        max_bytes: 10485760,
        max_file_bytes: 1048576,
        max_cases: 10,
      },
      include_content: true,
      markdown_render_chars: 1000,
      output: {
        bundle: '.wolf/context/context-bundle.json',
        markdown: '.wolf/context/context.md',
      },
      scenarios: [],
      ...overrides,
    } as ContextConfig;
  }

  it('should discover project files', async () => {
    writeFileSync(join(tempDir, 'file1.txt'), 'hello world');
    writeFileSync(join(tempDir, 'file2.js'), 'console.log("hi")');
    mkdirSync(join(tempDir, 'src'));
    writeFileSync(join(tempDir, 'src', 'nested.ts'), 'const x = 1;');

    const result = await scanner.scan(tempDir, defaultConfig());
    const paths = result.files.map((f) => f.path).sort();

    expect(paths).toEqual(['file1.txt', 'file2.js', 'src/nested.ts']);
    expect(result.metadata.files_scanned).toBe(3);
    expect(result.metadata.files_included).toBe(3);

    const file1 = result.files.find((f) => f.path === 'file1.txt')!;
    expect(file1.size).toBe(11);
    expect(file1.extension).toBe('.txt');
    expect(file1.content_included).toBe(true);
    expect(file1.content).toBe('hello world');
    expect(file1.hash).toBe(createHash('sha256').update('hello world').digest('hex'));
    expect(file1.mtime).toBeDefined();
  });

  it('should exclude patterns like node_modules', async () => {
    writeFileSync(join(tempDir, 'index.js'), 'module.exports = 1;');
    mkdirSync(join(tempDir, 'node_modules', 'foo'), { recursive: true });
    writeFileSync(join(tempDir, 'node_modules', 'foo', 'package.json'), '{}');

    const result = await scanner.scan(tempDir, defaultConfig({ exclude: ['node_modules/**'] }));
    const paths = result.files.map((f) => f.path);

    expect(paths).toContain('index.js');
    expect(paths).not.toContain('node_modules/foo/package.json');
  });

  it('should respect max_files limit', async () => {
    writeFileSync(join(tempDir, 'a.txt'), 'a');
    writeFileSync(join(tempDir, 'b.txt'), 'b');
    writeFileSync(join(tempDir, 'c.txt'), 'c');

    const result = await scanner.scan(
      tempDir,
      defaultConfig({ limits: { max_files: 2, max_bytes: 10485760, max_file_bytes: 1048576, max_cases: 10 } })
    );

    expect(result.files.length).toBe(2);
    expect(result.metadata.files_included).toBe(2);
    expect(result.metadata.limits_applied).toContain('max_files');
  });

  it('should skip symlinks escaping project root', async () => {
    const outsideDir = mkdtempSync(join(tmpdir(), 'wolf-outside-'));
    writeFileSync(join(outsideDir, 'secret.txt'), 'secret');

    writeFileSync(join(tempDir, 'safe.txt'), 'safe');
    symlinkSync(join(outsideDir, 'secret.txt'), join(tempDir, 'escape.txt'));

    const result = await scanner.scan(tempDir, defaultConfig());
    const paths = result.files.map((f) => f.path);

    expect(paths).toContain('safe.txt');
    expect(paths).not.toContain('escape.txt');
    expect(result.metadata.files_skipped).toBe(1);

    rmSync(outsideDir, { recursive: true, force: true });
  });

  it('should detect text vs binary files', async () => {
    writeFileSync(join(tempDir, 'text.txt'), 'hello world');
    writeFileSync(join(tempDir, 'binary.bin'), Buffer.from([0x00, 0x01, 0x02, 0x03]));

    const result = await scanner.scan(tempDir, defaultConfig());

    const textFile = result.files.find((f) => f.path === 'text.txt')!;
    const binaryFile = result.files.find((f) => f.path === 'binary.bin')!;

    expect(textFile.content_included).toBe(true);
    expect(textFile.content).toBe('hello world');

    expect(binaryFile.content_included).toBe(false);
    expect(binaryFile.content).toBeUndefined();
  });

  it('should truncate content when file exceeds max_file_bytes', async () => {
    const longContent = 'a'.repeat(200);
    writeFileSync(join(tempDir, 'long.txt'), longContent);

    const result = await scanner.scan(
      tempDir,
      defaultConfig({ limits: { max_files: 100, max_bytes: 10485760, max_file_bytes: 50, max_cases: 10 } })
    );

    const longFile = result.files.find((f) => f.path === 'long.txt')!;
    expect(longFile.content_included).toBe(true);
    expect(longFile.content_truncated).toBe(true);
    expect(Buffer.byteLength(longFile.content!, 'utf8')).toBe(50);
    expect(longFile.content).toBe('a'.repeat(50));
  });

  it('should exclude hidden directories by default', async () => {
    mkdirSync(join(tempDir, '.hidden'));
    writeFileSync(join(tempDir, '.hidden', 'file.txt'), 'hidden');
    writeFileSync(join(tempDir, 'visible.txt'), 'visible');

    const result = await scanner.scan(tempDir, defaultConfig());
    const paths = result.files.map((f) => f.path);

    expect(paths).toContain('visible.txt');
    expect(paths).not.toContain('.hidden/file.txt');
  });

  it('should exclude .wolf/context and .wolf/state by default', async () => {
    mkdirSync(join(tempDir, '.wolf', 'context'), { recursive: true });
    mkdirSync(join(tempDir, '.wolf', 'state'), { recursive: true });
    writeFileSync(join(tempDir, '.wolf', 'context', 'bundle.json'), '{}');
    writeFileSync(join(tempDir, '.wolf', 'state', 'db.sqlite'), '');
    writeFileSync(join(tempDir, 'normal.txt'), 'normal');

    const result = await scanner.scan(tempDir, defaultConfig());
    const paths = result.files.map((f) => f.path);

    expect(paths).toContain('normal.txt');
    expect(paths).not.toContain('.wolf/context/bundle.json');
    expect(paths).not.toContain('.wolf/state/db.sqlite');
  });

  it('should reject paths with ..', async () => {
    const result = await scanner.scan(tempDir + '/../escape', defaultConfig());
    expect(result.files).toEqual([]);
    expect(result.metadata.files_skipped).toBe(0);
  });

  it('should compute hash for binary files', async () => {
    const binaryData = Buffer.from([0x00, 0x01, 0x02, 0x03]);
    writeFileSync(join(tempDir, 'binary.bin'), binaryData);

    const result = await scanner.scan(tempDir, defaultConfig());
    const binaryFile = result.files.find((f) => f.path === 'binary.bin')!;

    expect(binaryFile.hash).toBe(createHash('sha256').update(binaryData).digest('hex'));
    expect(binaryFile.content_included).toBe(false);
  });

  it('should apply max_bytes limit after max_files', async () => {
    writeFileSync(join(tempDir, 'small.txt'), 'x');
    writeFileSync(join(tempDir, 'large.txt'), 'y'.repeat(100));

    const result = await scanner.scan(
      tempDir,
      defaultConfig({ limits: { max_files: 100, max_bytes: 50, max_file_bytes: 1048576, max_cases: 10 } })
    );

    expect(result.files.length).toBe(1);
    expect(result.metadata.limits_applied).toContain('max_bytes');
  });
});

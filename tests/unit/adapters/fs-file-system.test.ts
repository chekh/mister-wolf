import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { FsFileSystem } from '../../../src/adapters/fs/fs-file-system.js';

describe('FsFileSystem', () => {
  let tempDir: string;
  let fsFileSystem: FsFileSystem;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fs-test-'));
    fsFileSystem = new FsFileSystem();
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('listDirectory', () => {
    test('returns all entries with correct metadata', async () => {
      const filePath = path.join(tempDir, 'file.txt');
      const dirPath = path.join(tempDir, 'folder');
      await fs.writeFile(filePath, 'hello');
      await fs.mkdir(dirPath);

      const entries = await fsFileSystem.listDirectory(tempDir);
      const sorted = entries.sort((a, b) => a.name.localeCompare(b.name));

      expect(sorted).toHaveLength(2);
      expect(sorted[0]).toEqual({
        name: 'file.txt',
        path: filePath,
        isDirectory: false,
        size: 5,
      });
      expect(sorted[1]).toEqual({
        name: 'folder',
        path: dirPath,
        isDirectory: true,
        size: expect.any(Number),
      });
    });

    test('throws when path does not exist', async () => {
      const missingPath = path.join(tempDir, 'missing');
      await expect(fsFileSystem.listDirectory(missingPath)).rejects.toThrow();
    });
  });

  describe('readSmallTextFile', () => {
    test('returns content of a small text file', async () => {
      const filePath = path.join(tempDir, 'file.txt');
      await fs.writeFile(filePath, 'hello world');

      const content = await fsFileSystem.readSmallTextFile(filePath);

      expect(content).toBe('hello world');
    });

    test('returns null when file is missing', async () => {
      const filePath = path.join(tempDir, 'missing.txt');

      const content = await fsFileSystem.readSmallTextFile(filePath);

      expect(content).toBeNull();
    });

    test('returns null when path is a directory', async () => {
      const dirPath = path.join(tempDir, 'folder');
      await fs.mkdir(dirPath);

      const content = await fsFileSystem.readSmallTextFile(dirPath);

      expect(content).toBeNull();
    });

    test('returns null when file exceeds 1 MB', async () => {
      const filePath = path.join(tempDir, 'large.bin');
      await fs.writeFile(filePath, Buffer.alloc(1024 * 1024 + 1));

      const content = await fsFileSystem.readSmallTextFile(filePath);

      expect(content).toBeNull();
    });
  });

  describe('isDirectory', () => {
    test('returns true for an existing directory', async () => {
      const result = await fsFileSystem.isDirectory(tempDir);
      expect(result).toBe(true);
    });

    test('returns false for a missing path', async () => {
      const result = await fsFileSystem.isDirectory(path.join(tempDir, 'missing'));
      expect(result).toBe(false);
    });

    test('throws when path is a file', async () => {
      const filePath = path.join(tempDir, 'file.txt');
      await fs.writeFile(filePath, 'x');

      await expect(fsFileSystem.isDirectory(filePath)).rejects.toThrow();
    });
  });

  describe('exists', () => {
    test('returns true for an existing file', async () => {
      const filePath = path.join(tempDir, 'file.txt');
      await fs.writeFile(filePath, 'x');

      const result = await fsFileSystem.exists(filePath);

      expect(result).toBe(true);
    });

    test('returns true for an existing directory', async () => {
      const result = await fsFileSystem.exists(tempDir);
      expect(result).toBe(true);
    });

    test('returns false for a missing path', async () => {
      const result = await fsFileSystem.exists(path.join(tempDir, 'missing'));
      expect(result).toBe(false);
    });
  });

  describe('writeFile', () => {
    test('creates parent directories and writes UTF-8 content', async () => {
      const filePath = path.join(tempDir, 'nested', 'deep', 'file.txt');
      const content = 'hello world';

      await fsFileSystem.writeFile(filePath, content);

      const written = await fs.readFile(filePath, 'utf8');
      expect(written).toBe(content);
    });
  });
});

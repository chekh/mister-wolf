import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import type { DirectoryEntry, FileSystem } from '../../ports/file-system.port.js';

const MAX_SMALL_FILE_SIZE = 1024 * 1024;

export class FsFileSystem implements FileSystem {
  async listDirectory(directoryPath: string): Promise<DirectoryEntry[]> {
    const entries = await fs.readdir(directoryPath, { withFileTypes: true });

    return Promise.all(
      entries.map(async (entry) => {
        const entryPath = path.join(directoryPath, entry.name);
        const stats = await fs.stat(entryPath);

        return {
          name: entry.name,
          path: entryPath,
          isDirectory: stats.isDirectory(),
          size: stats.size,
        };
      })
    );
  }

  async readSmallTextFile(filePath: string): Promise<string | null> {
    let stats;
    try {
      stats = await fs.stat(filePath);
    } catch (error) {
      if (isNoSuchFileError(error)) {
        return null;
      }
      throw error;
    }

    if (!stats.isFile() || stats.size > MAX_SMALL_FILE_SIZE) {
      return null;
    }

    return fs.readFile(filePath, 'utf8');
  }

  async isDirectory(directoryPath: string): Promise<boolean> {
    try {
      const stats = await fs.stat(directoryPath);
      if (!stats.isDirectory()) {
        throw new Error(`Path is not a directory: ${directoryPath}`);
      }
      return true;
    } catch (error) {
      if (isNoSuchFileError(error)) {
        return false;
      }
      throw error;
    }
  }

  async exists(targetPath: string): Promise<boolean> {
    try {
      await fs.access(targetPath, fs.constants.F_OK);
      return true;
    } catch {
      return false;
    }
  }

  async realPath(target: string): Promise<string> {
    return fs.realpath(target);
  }

  async fileDigest(target: string): Promise<string> {
    const handle = await fs.open(target, 'r');
    try {
      const stat = await handle.stat();
      if (!stat.isFile()) throw new Error(`Not a regular file: ${target}`);
      const hash = createHash('sha256');
      const buffer = Buffer.alloc(64 * 1024);
      while (true) {
        const { bytesRead } = await handle.read(buffer, 0, buffer.length, null);
        if (bytesRead === 0) break;
        hash.update(buffer.subarray(0, bytesRead));
      }
      return hash.digest('hex');
    } finally {
      await handle.close();
    }
  }

  async writeFile(filePath: string, content: string): Promise<void> {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, content, 'utf8');
  }
}

function isNoSuchFileError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}

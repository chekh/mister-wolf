import fs from 'node:fs/promises';
import path from 'node:path';
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
}

function isNoSuchFileError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}

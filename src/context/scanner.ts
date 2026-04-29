import fg from 'fast-glob';
const { glob } = fg;
import { createHash } from 'crypto';
import { readFileSync, lstatSync, realpathSync } from 'fs';
import { resolve, relative } from 'path';
import { ContextFile, ScanMetadata } from '../types/context.js';
import { ContextConfig } from '../config/project-config.js';

export interface ScanResult {
  files: ContextFile[];
  metadata: ScanMetadata;
}

function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, '/');
}

function isHiddenPath(relPath: string): boolean {
  return relPath.split('/').some((segment) => segment.startsWith('.') && segment !== '.' && segment !== '..');
}

function allowsHiddenPaths(patterns: string[]): boolean {
  return patterns.some((p) => {
    const segments = p.split(/[\/\\]/);
    return segments.some((s) => s.startsWith('.') && s !== '.' && s !== '..');
  });
}

function isBinary(buffer: Buffer): boolean {
  const checkBytes = Math.min(buffer.length, 8192);
  for (let i = 0; i < checkBytes; i++) {
    if (buffer[i] === 0x00) {
      return true;
    }
  }
  return false;
}

export class ContextScanner {
  async scan(projectRoot: string, config: ContextConfig): Promise<ScanResult> {
    const resolvedRoot = resolve(projectRoot);

    // Path traversal guard: reject projectRoot containing ..
    if (projectRoot.includes('..')) {
      return {
        files: [],
        metadata: {
          files_scanned: 0,
          files_included: 0,
          files_skipped: 0,
          bytes_included: 0,
          bytes_truncated: 0,
          limits_applied: [],
        },
      };
    }

    const includePatterns = config.include.length > 0 ? config.include : ['**/*'];
    const excludePatterns = config.exclude || [];

    // Use onlyFiles: false to detect symlinks; directories are filtered manually
    const entries = await glob(includePatterns, {
      cwd: resolvedRoot,
      dot: true,
      onlyFiles: false,
      absolute: true,
      followSymbolicLinks: false,
      ignore: excludePatterns,
    });

    const files: ContextFile[] = [];
    let filesScanned = 0;
    let bytesIncluded = 0;
    let bytesTruncated = 0;
    let filesSkipped = 0;
    const limitsApplied = new Set<string>();
    const skippedFiles: string[] = [];

    const explicitHiddenAllowed = allowsHiddenPaths(includePatterns);

    for (const entry of entries) {
      const relPath = normalizePath(relative(resolvedRoot, entry));

      // Path traversal guard: relative path must not escape project root
      if (relPath.startsWith('..') || relPath.includes('/../')) {
        filesSkipped++;
        skippedFiles.push(relPath);
        continue;
      }

      let lstat;
      try {
        lstat = lstatSync(entry);
      } catch {
        filesSkipped++;
        skippedFiles.push(relPath);
        continue;
      }

      // Skip directories
      if (lstat.isDirectory()) {
        continue;
      }

      // Handle symlinks: resolve and check for escape
      if (lstat.isSymbolicLink()) {
        let realPath: string;
        try {
          realPath = realpathSync(entry);
        } catch {
          filesSkipped++;
          skippedFiles.push(relPath);
          continue;
        }

        const realRelPath = normalizePath(relative(resolvedRoot, realPath));
        if (
          realRelPath.startsWith('..') ||
          realRelPath.includes('/../') ||
          (!realPath.startsWith(resolvedRoot + '/') && realPath !== resolvedRoot)
        ) {
          filesSkipped++;
          skippedFiles.push(relPath);
          continue;
        }

        // Skip symlinks pointing to directories
        try {
          const targetStat = lstatSync(realPath);
          if (targetStat.isDirectory()) {
            continue;
          }
        } catch {
          filesSkipped++;
          skippedFiles.push(relPath);
          continue;
        }
      } else if (!lstat.isFile()) {
        // Skip non-file, non-symlink entries (fifos, sockets, etc.)
        continue;
      }

      filesScanned++;

      // Hidden path guard
      if (isHiddenPath(relPath) && !explicitHiddenAllowed) {
        continue;
      }

      // max_files limit
      if (files.length >= config.limits.max_files) {
        limitsApplied.add('max_files');
        continue;
      }

      // Read file content for hash and potential inclusion
      let fileBuffer: Buffer;
      try {
        fileBuffer = readFileSync(entry);
      } catch {
        filesSkipped++;
        skippedFiles.push(relPath);
        continue;
      }

      const hash = createHash('sha256').update(fileBuffer).digest('hex');
      const binary = isBinary(fileBuffer);
      const fileSize = fileBuffer.length;

      let content: string | undefined;
      let contentIncluded = false;
      let contentTruncated = false;
      let potentialBytes = 0;

      if (config.include_content && !binary) {
        const maxFileBytes = config.limits.max_file_bytes;
        if (fileSize > maxFileBytes) {
          const truncated = fileBuffer.subarray(0, maxFileBytes);
          content = truncated.toString('utf-8');
          contentTruncated = true;
          potentialBytes = maxFileBytes;
        } else {
          content = fileBuffer.toString('utf-8');
          potentialBytes = fileSize;
        }
        contentIncluded = true;
      }

      // max_bytes limit (applied after max_files)
      if (bytesIncluded + potentialBytes > config.limits.max_bytes) {
        limitsApplied.add('max_bytes');
        continue;
      }

      bytesIncluded += potentialBytes;
      if (contentTruncated) {
        bytesTruncated += fileSize - config.limits.max_file_bytes;
      }

      const lastDot = relPath.lastIndexOf('.');
      const extension = lastDot > 0 ? relPath.slice(lastDot) : '';
      const mtime = lstat.mtime.toISOString();

      files.push({
        path: relPath,
        kind: 'project_file',
        size: fileSize,
        extension,
        hash,
        mtime,
        content_included: contentIncluded,
        content_truncated: contentTruncated,
        content,
      });
    }

    const metadata: ScanMetadata = {
      files_scanned: filesScanned,
      files_included: files.length,
      files_skipped: filesSkipped,
      bytes_included: bytesIncluded,
      bytes_truncated: bytesTruncated,
      limits_applied: Array.from(limitsApplied),
      skipped_files: skippedFiles.length > 0 ? skippedFiles : undefined,
    };

    return { files, metadata };
  }
}

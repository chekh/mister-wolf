import path from 'node:path';
import type { FileSystem } from '../../ports/file-system.port.js';
import type { ProjectScanner } from '../../ports/project-scanner.port.js';
import type { ProjectSnapshot } from '../../domain/schemas/project-scan-schema.js';

const IGNORED_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'coverage',
  '.coverage',
  '.wolf',
  '.codegraph',
  '.worktrees',
]);

const CONFIG_FILE_NAMES = new Set([
  'package.json',
  'tsconfig.json',
  'vitest.config.ts',
  'vite.config.ts',
  'jest.config.js',
  'jest.config.ts',
  'tailwind.config.js',
  'pyproject.toml',
  'Cargo.toml',
  'go.mod',
  '.prettierrc',
  '.eslintrc',
]);

const BINARY_EXTENSIONS = new Set([
  'png',
  'jpg',
  'jpeg',
  'gif',
  'svg',
  'ico',
  'webp',
  'mp3',
  'mp4',
  'wav',
  'avi',
  'mov',
  'pdf',
  'doc',
  'docx',
  'xls',
  'xlsx',
  'zip',
  'tar',
  'gz',
  'rar',
  '7z',
  'exe',
  'dll',
  'so',
  'dylib',
  'sqlite',
  'db',
  'wasm',
]);

const MAX_FILE_BYTES = 1024 * 1024;

export class HeuristicProjectScanner implements ProjectScanner {
  constructor(private fs: FileSystem) {}

  async scan(root: string): Promise<ProjectSnapshot> {
    const files: ProjectSnapshot['files'] = [];
    const languages = new Set<string>();
    const configFiles = new Set<string>();
    const topLevelDirectories = new Set<string>();
    const counters = { fileCount: 0 };

    await this.walk(root, root, files, languages, configFiles, topLevelDirectories, counters);

    const packageJson = await this.readPackageJson(root);
    const entryPoints = this.detectEntryPoints(packageJson, files);
    const dependencies = this.extractDependencies(packageJson);
    const projectName = typeof packageJson?.name === 'string' ? packageJson.name : path.basename(root);

    return {
      projectName,
      root: '.',
      branch: await this.currentBranch(root),
      commit: await this.currentCommit(root),
      generatedAt: new Date().toISOString(),
      summary: {
        languages: [...languages].sort(),
        entryPoints: entryPoints.sort(),
        configFiles: [...configFiles].sort(),
        dependencies: dependencies.sort(),
        topLevelDirectories: [...topLevelDirectories].sort(),
        fileCount: counters.fileCount,
      },
      files: files.sort((a, b) => a.path.localeCompare(b.path)),
    };
  }

  private async walk(
    root: string,
    current: string,
    files: ProjectSnapshot['files'],
    languages: Set<string>,
    configFiles: Set<string>,
    topLevelDirectories: Set<string>,
    counters: { fileCount: number }
  ): Promise<void> {
    const entries = await this.fs.listDirectory(current);

    for (const entry of entries) {
      const rel = path.relative(root, entry.path);
      const depth = rel.split(path.sep).length;

      if (entry.isDirectory) {
        if (IGNORED_DIRS.has(entry.name)) continue;
        if (depth === 1) topLevelDirectories.add(entry.name);
        await this.walk(root, entry.path, files, languages, configFiles, topLevelDirectories, counters);
      } else {
        if (entry.size > MAX_FILE_BYTES) continue;

        const ext = path.extname(entry.name).slice(1).toLowerCase();
        if (BINARY_EXTENSIONS.has(ext)) continue;

        files.push({ path: rel, extension: ext || undefined, size: entry.size });
        counters.fileCount++;

        if (ext) languages.add(ext);
        if (CONFIG_FILE_NAMES.has(entry.name)) configFiles.add(rel);
      }
    }
  }

  private async readPackageJson(root: string): Promise<Record<string, unknown> | null> {
    const raw = await this.fs.readSmallTextFile(path.join(root, 'package.json'));
    if (!raw) return null;
    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  private detectEntryPoints(packageJson: Record<string, unknown> | null, files: ProjectSnapshot['files']): string[] {
    const entries: string[] = [];

    if (packageJson) {
      if (typeof packageJson.main === 'string') entries.push(packageJson.main);

      const bin = packageJson.bin;
      if (typeof bin === 'string') entries.push(bin);
      if (typeof bin === 'object' && bin !== null) {
        for (const value of Object.values(bin)) {
          if (typeof value === 'string') entries.push(value);
        }
      }
    }

    const candidates = ['src/index.ts', 'src/index.js', 'src/bootstrap/cli.ts', 'src/bootstrap/cli.js'];
    for (const candidate of candidates) {
      if (files.some((file) => file.path === candidate)) entries.push(candidate);
    }

    const cleaned = entries
      .map((entry) => entry.replace(/^\.\/dist\//, 'src/').replace(/\.js$/, '.ts'))
      .filter((entry) => !entry.startsWith('dist/'));

    return [...new Set(cleaned)];
  }

  private extractDependencies(packageJson: Record<string, unknown> | null): string[] {
    if (!packageJson) return [];
    const deps = [
      ...Object.keys((packageJson.dependencies as Record<string, unknown>) ?? {}),
      ...Object.keys((packageJson.devDependencies as Record<string, unknown>) ?? {}),
    ];
    return [...new Set(deps)];
  }

  private async currentBranch(root: string): Promise<string | undefined> {
    const head = await this.readGitHead(root);
    if (!head) return undefined;
    const refMatch = head.match(/ref: refs\/heads\/(\S+)/);
    return refMatch?.[1];
  }

  private async currentCommit(root: string): Promise<string | undefined> {
    const head = await this.readGitHead(root);
    if (!head) return undefined;
    const refMatch = head.match(/ref: (\S+)/);
    if (refMatch) {
      const gitDir = await this.resolveGitDir(root);
      const commit = await this.fs.readSmallTextFile(path.join(gitDir, refMatch[1]));
      return commit?.trim() ?? undefined;
    }
    return head.trim();
  }

  private async resolveGitDir(root: string): Promise<string> {
    const gitPath = path.join(root, '.git');
    const stat = await this.safeStat(gitPath);
    if (stat?.isFile()) {
      const content = await this.fs.readSmallTextFile(gitPath);
      const match = content?.match(/^gitdir: (.+)$/m);
      if (match) {
        const resolved = path.resolve(root, match[1].trim());
        return resolved;
      }
    }
    return gitPath;
  }

  private async readGitHead(root: string): Promise<string | null> {
    const gitDir = await this.resolveGitDir(root);
    return this.fs.readSmallTextFile(path.join(gitDir, 'HEAD'));
  }

  private async safeStat(filePath: string): Promise<{ isFile(): boolean; isDirectory(): boolean } | null> {
    try {
      const entries = await this.fs.listDirectory(path.dirname(filePath));
      const entry = entries.find((e) => e.path === filePath);
      if (!entry) return null;
      return {
        isFile: () => !entry.isDirectory,
        isDirectory: () => entry.isDirectory,
      };
    } catch {
      return null;
    }
  }
}

import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

/**
 * TTL lock-файла параллельного upgrade (REQ-01/06): проход, убитый без
 * release (SIGKILL/OOM), не должен блокировать следующие запуски навсегда —
 * протухший lock перехватывается. 10 минут ≥ парковый бюджет N03.1 (≤40 с
 * на 4 проекта) с запасом на медленные окружения.
 */
export const LOCK_TTL_MS = 10 * 60 * 1000;

/**
 * Lock-файл параллельного upgrade в ОС-tmp (механика в духе flock, но с
 * TTL). Владелец — экземпляр в процессе: повторный acquire() тем же
 * экземпляром идемпотентен; живой чужой lock → Error 'upgrade already
 * running'; отсутствующий/протухший/битый — захватывается перезаписью.
 */
export class UpgradeLock {
  private readonly held = new Set<string>();

  constructor(
    private readonly now: () => number = Date.now,
    private readonly dir: string = tmpdir()
  ) {}

  private file(id: string): string {
    return join(this.dir, `${id}.lock`);
  }

  acquire(id: string): boolean {
    if (this.held.has(id)) return true; // тот же владелец — идемпотентно
    let raw: string | undefined;
    try {
      raw = readFileSync(this.file(id), 'utf-8');
    } catch {
      raw = undefined; // lock-файла нет — захват
    }
    if (raw !== undefined) {
      const ts = Number(raw);
      if (Number.isFinite(ts) && this.now() - ts < LOCK_TTL_MS) throw new Error('upgrade already running');
      // протухший (≥ TTL) или битый lock — перезаписываем
    }
    mkdirSync(this.dir, { recursive: true });
    writeFileSync(this.file(id), String(this.now()));
    this.held.add(id);
    return true;
  }

  release(id: string): void {
    this.held.delete(id);
    try {
      unlinkSync(this.file(id));
    } catch {
      // файла нет — уже снят
    }
  }
}

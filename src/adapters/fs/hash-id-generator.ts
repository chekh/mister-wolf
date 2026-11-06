import { createHash } from 'crypto';
import { IdGenerator } from '../../ports/id-generator.port.js';
import { normalizeMemorySlug } from '../../domain/memory-slug.js';

/**
 * 2.32.0 (Q1/Q2): ID записи = `mem_<YYYYMMDD>_<english-slug>_<hash6>`, а без
 * валидного slug — `mem_<YYYYMMDD>_<hash6>` без слов. Транслитерация русского
 * заголовка удалена: slug даёт агент-создатель. Хеш детерминирован
 * (slug+дата; для fallback — отпечаток текста+дата), поэтому одинаковый вход
 * даёт одинаковый ID, а не новый на каждый вызов.
 */
export class HashIdGenerator implements IdGenerator {
  generateMemoryId(date: Date, slug?: string, fingerprint?: string): string {
    const day = this.datePart(date);
    const normalized = normalizeMemorySlug(slug);
    // slug есть → хеш только от slug+дата (коллизия разрешается tie-break в add);
    // slug нет/невалиден → слов в id нет, но хеш различает разные записи дня.
    const seed = normalized === null ? `${day}|${fingerprint ?? ''}` : `${normalized}|${day}`;
    const hash = this.shortHash(seed);
    return normalized === null ? `mem_${day}_${hash}` : `mem_${day}_${normalized}_${hash}`;
  }

  generateEventId(date: Date): string {
    const hash = this.shortHash(date.toISOString() + Math.random().toString());
    return `evt_${this.datetimePart(date)}_${hash}`;
  }

  private datePart(date: Date): string {
    return date.toISOString().slice(0, 10).replace(/-/g, '');
  }

  private datetimePart(date: Date): string {
    return date.toISOString().slice(0, 19).replace(/[-:T]/g, '');
  }

  private shortHash(input: string): string {
    return createHash('sha256').update(input).digest('hex').substring(0, 6);
  }
}

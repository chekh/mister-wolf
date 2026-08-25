import { createHash } from 'crypto';
import { IdGenerator } from '../../ports/id-generator.port.js';

export class HashIdGenerator implements IdGenerator {
  // ponytail: flat translit map, deterministic; switch to a lib only if other
  // alphabets (CJK etc.) need real slugs
  private static readonly CYRILLIC: Record<string, string> = {
    а: 'a',
    б: 'b',
    в: 'v',
    г: 'g',
    д: 'd',
    е: 'e',
    ё: 'e',
    ж: 'zh',
    з: 'z',
    и: 'i',
    й: 'y',
    к: 'k',
    л: 'l',
    м: 'm',
    н: 'n',
    о: 'o',
    п: 'p',
    р: 'r',
    с: 's',
    т: 't',
    у: 'u',
    ф: 'f',
    х: 'kh',
    ц: 'ts',
    ч: 'ch',
    ш: 'sh',
    щ: 'shch',
    ъ: '',
    ы: 'y',
    ь: '',
    э: 'e',
    ю: 'yu',
    я: 'ya',
  };

  generateMemoryId(date: Date, slug: string): string {
    const base = `${this.datePart(date)}_${this.slugify(slug)}`;
    const hash = this.shortHash(base + date.toISOString());
    return `mem_${base}_${hash}`;
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

  private slugify(input: string): string {
    const translit = input.toLowerCase().replace(/[а-яё]/g, (ch) => HashIdGenerator.CYRILLIC[ch] ?? '');
    const slug = translit
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .substring(0, 40)
      .replace(/^_+|_+$/g, '');
    return slug || this.shortHash(input);
  }

  private shortHash(input: string): string {
    return createHash('sha256').update(input).digest('hex').substring(0, 6);
  }
}

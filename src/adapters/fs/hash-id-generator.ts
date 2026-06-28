import { createHash } from 'crypto';
import { IdGenerator } from '../../ports/id-generator.port.js';

export class HashIdGenerator implements IdGenerator {
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
    return input
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .substring(0, 40);
  }

  private shortHash(input: string): string {
    return createHash('sha256').update(input).digest('hex').substring(0, 6);
  }
}

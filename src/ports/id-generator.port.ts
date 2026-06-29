export interface IdGenerator {
  generateMemoryId(date: Date, slug: string): string;
  generateEventId(date: Date): string;
}

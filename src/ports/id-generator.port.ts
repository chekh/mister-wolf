export interface IdGenerator {
  /** ID записи памяти: `mem_<date>_<slug>_<hash6>` либо `mem_<date>_<hash6>`,
   *  если slug не передан/невалиден (2.32.0, Q1/Q2). `fingerprint` участвует
   *  только в fallback-хеше: слов в id он не добавляет. */
  generateMemoryId(date: Date, slug?: string, fingerprint?: string): string;
  generateEventId(date: Date): string;
}

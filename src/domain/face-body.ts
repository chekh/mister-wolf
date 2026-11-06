// src/domain/face-body.ts
/**
 * Единственная граница «frontmatter → тело» для документов лиц и их шаблонов.
 *
 * 2.32.1: до этого границу разбирали ДВА разных regex. Посев и read-only предикат
 * diverged оставляли в теле ведущий перевод строки после frontmatter (допускали
 * ноль или один `\n`), а хранилище памяти съедало и терминатор, и следующий
 * пустой перевод строки. Документы, различающиеся ТОЛЬКО этим переводом,
 * помечались как diverged. Теперь граница одна: закрывающий `---`, его
 * терминатор и не более одного следующего пустого перевода строки — часть
 * разделителя, а не тела.
 *
 * Дополнительно (2.32.1): уже посеянные старым regex лица хранят ОДИН лишний
 * ведущий перевод строки в теле. Для сравнения ведущие пустые строки срезаются
 * (`bodiesEqual`): это шум границы frontmatter, а не содержание. Внутренние
 * пробелы и переводы строк не нормализуются — содержательное расхождение
 * обязано ловиться.
 */

export interface FrontmatterDocument {
  /** Текст между строками-разделителями `---` (без самих разделителей). */
  frontmatter: string;
  /** Тело после разделителя (терминатор и один пустой перевод строки съедены). */
  body: string;
}

/** Семантика прежнего FRONTMATTER_RE хранилища, плюс терпимость к CRLF. */
const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n(?:\r?\n)?([\s\S]*)$/;

/** Разбор границы; null — документ не начинается с frontmatter (вызывающий
 *  сам решает, как трактовать такой документ). */
export function splitFrontmatterDocument(raw: string): FrontmatterDocument | null {
  const m = raw.match(FRONTMATTER_RE);
  return m ? { frontmatter: m[1]!, body: m[2]! } : null;
}

/** Тело документа; документ без frontmatter возвращается как есть. */
export function documentBody(raw: string): string {
  return splitFrontmatterDocument(raw)?.body ?? raw;
}

/** Плоские пары `ключ: значение` из текста frontmatter (без YAML-разбора:
 *  только однострочные скаляры, прецедент parseFrontmatter посева). */
export function frontmatterScalars(frontmatter: string): Record<string, string> {
  const meta: Record<string, string> = {};
  for (const line of frontmatter.split('\n')) {
    const kv = line.match(/^([\w-]+):\s*(.+)$/);
    if (kv) meta[kv[1]!] = kv[2]!.trim();
  }
  return meta;
}

/** Сырой документ → простые пары frontmatter + каноничное тело. */
export function parseFaceDocument(raw: string): { meta: Record<string, string>; body: string } {
  const doc = splitFrontmatterDocument(raw);
  if (!doc) return { meta: {}, body: raw };
  return { meta: frontmatterScalars(doc.frontmatter), body: doc.body };
}

/** Форма тела для сравнения: срезаны ведущие пустые строки (шум границы
 *  frontmatter, в т.ч. единственный лишний `\n` старого посева). */
function comparableBody(body: string): string {
  return body.replace(/^(?:[ \t]*\r?\n)+/, '');
}

/** Равенство тел лиц с точностью до ведущих пустых строк; содержательные
 *  различия (фразы, секции, внутренние переводы строк) сохраняются. */
export function bodiesEqual(a: string, b: string): boolean {
  return comparableBody(a) === comparableBody(b);
}

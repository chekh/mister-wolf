import { describe, it, expect } from 'vitest';
import {
  isCanonicalDocumentId,
  canonicalPath,
  documentSlug,
  documentRefId,
  withTieBreak,
} from '../../src/adapters/fs/document-id.js';

describe('document-id (спека 2.1.0 §2.1, F9)', () => {
  it('канонический формат mem_ГГГГММДД_doc_<slug>_<hash8>', () => {
    const id = documentRefId('docs/guide/architecture.md', '2026-09-02T10:00:00Z');
    expect(id).toMatch(/^mem_20260902_doc_architecture_[0-9a-f]{8}$/);
  });

  it('hash8 детерминирован от canonical path, не от даты', () => {
    const a = documentRefId('docs/a.md', '2026-09-01T00:00:00Z');
    const b = documentRefId('docs/a.md', '2026-09-02T00:00:00Z');
    expect(a.slice(-8)).toBe(b.slice(-8));
    expect(a).not.toBe(b); // дата в id различается
  });

  it('разные пути → разные hash8 ( slug совпадает )', () => {
    const a = documentRefId('docs/a/report.md', '2026-09-02T00:00:00Z');
    const b = documentRefId('docs/b/report.md', '2026-09-02T00:00:00Z');
    expect(a).not.toBe(b);
    expect(documentSlug('docs/a/report.md')).toBe('report');
  });

  it('slug: расширение отбрасывается, kebab-case, кириллица транслитится', () => {
    expect(documentSlug('docs/2026-08-30-web-gui-design.md')).toBe('2026-08-30-web-gui-design');
    expect(documentSlug('docs/Руководство.md')).toBe('rukovodstvo');
    expect(documentSlug('docs/...md')).toBe('doc'); // пустой slug → fallback
  });

  it('canonicalPath: posix, без ведущего ./', () => {
    expect(canonicalPath('.\\docs\\a.md')).toBe('docs/a.md');
    expect(canonicalPath('./docs/a.md')).toBe('docs/a.md');
  });

  it('isCanonicalDocumentId: пример спеки и tie-break-суффикс', () => {
    expect(isCanonicalDocumentId('mem_20260902_doc_architecture_9f31c2ab')).toBe(true);
    expect(isCanonicalDocumentId('mem_20260902_doc_architecture_9f31c2ab-2')).toBe(true);
    expect(isCanonicalDocumentId('doc_docs_guide_architecture_md')).toBe(false);
    expect(isCanonicalDocumentId('mem_20260902_doc_architecture_9F31C2AB')).toBe(false); // hex lowercase
  });

  it('withTieBreak: свободный id как есть, занят → -2, -3', () => {
    expect(withTieBreak('mem_x_doc_a_11111111', ['mem_x_doc_b_22222222'])).toBe('mem_x_doc_a_11111111');
    expect(withTieBreak('mem_x_doc_a_11111111', ['mem_x_doc_a_11111111'])).toBe('mem_x_doc_a_11111111-2');
    expect(withTieBreak('mem_x_doc_a_11111111', ['mem_x_doc_a_11111111', 'mem_x_doc_a_11111111-2'])).toBe(
      'mem_x_doc_a_11111111-3'
    );
  });
});

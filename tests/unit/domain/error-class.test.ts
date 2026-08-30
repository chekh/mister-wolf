import { describe, it, expect } from 'vitest';
import {
  classifyError,
  DEFAULT_ERROR_CLASS_RULES,
  UNCATEGORIZED_ERROR_CLASS,
} from '../../../src/domain/error-class.js';

describe('Ф20 (D1.2): error_class классификатор — детерминированность и таблица', () => {
  it('одинаковые входы → одинаковый id (стабильность, спека §2.1)', () => {
    const input = { message: 'spawn opencode ENOENT', code: 'ENOENT' };
    const first = classifyError(input);
    for (let i = 0; i < 5; i++) expect(classifyError(input)).toBe(first);
    expect(first).toBe('tool_not_found');
  });

  it('фиксированная таблица: известные классы ошибок', () => {
    expect(classifyError({ message: 'spawn opencode ENOENT' })).toBe('tool_not_found');
    expect(classifyError({ message: 'opencode not found in PATH' })).toBe('tool_not_found');
    expect(classifyError({ message: "ENOENT: no such file or directory, open 'x'" })).toBe('file_not_found');
    expect(classifyError({ message: 'Cannot find module foo' })).toBe('dependency_missing');
    expect(classifyError({ message: 'Request timeout after 30s' })).toBe('timeout');
    expect(classifyError({ message: '429 Too Many Requests' })).toBe('rate_limit');
    expect(classifyError({ message: 'permission denied, open .env' })).toBe('auth');
    expect(classifyError({ message: 'fetch failed: ECONNREFUSED' })).toBe('network');
    expect(classifyError({ message: 'maximum context length exceeded' })).toBe('context_overflow');
    expect(classifyError({ message: 'SyntaxError: Unexpected token }' })).toBe('syntax_error');
    expect(classifyError({ message: 'error: unknown option --foo' })).toBe('invalid_input');
    expect(classifyError({ message: 'EEXIST: file already exists' })).toBe('conflict');
    expect(classifyError({ message: 'Unexpected server error' })).toBe('llm_error');
  });

  it('порядок правил значим: файловый ENOENT ≠ spawn ENOENT', () => {
    // «no such file or directory» специфичнее и матчится раньше «enoent»
    expect(classifyError({ message: "ENOENT: no such file or directory, open 'package.json'" })).toBe('file_not_found');
    expect(classifyError({ message: 'Error: spawn opencode ENOENT' })).toBe('tool_not_found');
  });

  it('нет совпадения → uncategorized (вход для холодного ErrorClassRefiner, D2)', () => {
    expect(classifyError({ message: 'что-то странное случилось' })).toBe(UNCATEGORIZED_ERROR_CLASS);
    expect(classifyError({})).toBe(UNCATEGORIZED_ERROR_CLASS);
  });

  it('проектная таксономия (config.yaml) матчится раньше дефолтной', () => {
    const projectRules = [{ id: 'grpc_unavailable', match: ['grpc', 'unavailable'] }];
    expect(classifyError({ message: 'grpc channel unavailable' }, projectRules)).toBe('grpc_unavailable');
    // без проектного правила — дефолтная таблица
    expect(classifyError({ message: 'grpc channel unavailable' })).toBe(UNCATEGORIZED_ERROR_CLASS);
  });

  it('дефолтная таблица непустая и с уникальными id (ключ Ф21 стабилен)', () => {
    const ids = DEFAULT_ERROR_CLASS_RULES.map((r) => r.id);
    expect(ids.length).toBeGreaterThanOrEqual(15);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

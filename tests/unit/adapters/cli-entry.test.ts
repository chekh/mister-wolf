import { describe, it, expect, afterEach, vi } from 'vitest';
import { safeCwd } from '../../../src/adapters/cli/cli-entry.js';
import { UserFacingError } from '../../../src/domain/errors.js';

describe('safeCwd (F13: удалённый cwd → ENOENT uv_cwd)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('в норме возвращает process.cwd()', () => {
    expect(safeCwd()).toBe(process.cwd());
  });

  it('при ENOENT из process.cwd() бросает UserFacingError с однострочным сообщением', () => {
    vi.spyOn(process, 'cwd').mockImplementation(() => {
      throw new Error('ENOENT: no such file or directory, uv_cwd');
    });
    try {
      safeCwd();
      expect.unreachable('safeCwd должен был бросить UserFacingError');
    } catch (err) {
      expect(err).toBeInstanceOf(UserFacingError);
      expect((err as UserFacingError).message).toContain('текущий каталог не существует');
    }
  });
});

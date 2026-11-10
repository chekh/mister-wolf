import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['./tests/setup.ts'], // F16: XDG-изоляция юзер-конфига в tmp
    // Vitest 3: пул по умолчанию — forks. На 6-ядерной машине разработки
    // ограничиваем 4 воркерами, чтобы 2 ядра оставались системе.
    pool: 'forks',
    poolOptions: { forks: { maxForks: 4 } },
  },
});

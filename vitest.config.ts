import { cpus } from 'node:os';
import { defineConfig } from 'vitest/config';

// Каждый форк тянет native better-sqlite3 и порождает дочерние процессы
// (git, CLI), поэтому «все ядра» на практике означают глубокую очередь и
// неотзывчивую машину. По умолчанию — половина логических CPU (не больше 4);
// переопределяется через WOLF_TEST_MAX_FORKS.
const requestedForks = Number(process.env.WOLF_TEST_MAX_FORKS);
const maxForks =
  Number.isInteger(requestedForks) && requestedForks > 0
    ? requestedForks
    : Math.min(4, Math.max(1, Math.floor(cpus().length / 2)));

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['./tests/setup.ts'], // F16: XDG-изоляция юзер-конфига в tmp
    // Интеграционные тесты с полными init --full близки к дефолтным 5s под
    // нагрузкой полного прогона (изолированно ~2s): 20s снимает чувствительность
    // к нагрузке машины, не маскируя реальные зависания (e2e — 120s отдельно).
    testTimeout: 20_000,
    // Vitest 3: пул по умолчанию — forks. Число воркеров считается от ядер
    // (см. maxForks выше), чтобы машина разработки оставалась отзывчивой.
    pool: 'forks',
    poolOptions: { forks: { maxForks, minForks: 1 } },
  },
});

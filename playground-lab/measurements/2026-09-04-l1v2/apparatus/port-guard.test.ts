import net from 'node:net';
import { describe, expect, it } from 'vitest';

// Port-guard: тестовое окружение требует, чтобы порт 5173 был свободен.
describe('port-guard', () => {
  it('порт 5173 свободен', async () => {
    const guard = new Promise<void>((resolve, reject) => {
      const server = net.createServer();
      server.once('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EADDRINUSE') {
          reject(new Error('port-guard: порт 5173 занят (EADDRINUSE) — освободите его и перезапустите npm run check'));
        } else {
          reject(err);
        }
      });
      server.listen(5173, '127.0.0.1', () => server.close(() => resolve()));
    });
    await expect(guard).resolves.toBeUndefined();
  });
});

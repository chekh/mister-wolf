import { describe, it, expect } from 'vitest';
import { parseRouterLog } from '../../../src/domain/router-log.js';

/** T003: толерантный k=v-парсер router.log плагина wolf-router. */
describe('parseRouterLog', () => {
  it('hit с name/variant и miss; injected-поле игнорируется', () => {
    const text = [
      '2026-09-27T09:00:00.000Z agent-id=worker-implementer playbook=hit name=mem_pb_v4 variant=canonical injected=yes',
      '2026-09-27T09:00:01.000Z agent-id=executor-lead playbook=miss injected=no',
    ].join('\n');
    const { rows, malformedLines } = parseRouterLog(text);
    expect(malformedLines).toBe(0);
    expect(rows).toEqual([
      {
        ts: '2026-09-27T09:00:00.000Z',
        agentId: 'worker-implementer',
        hit: true,
        playbookId: 'mem_pb_v4',
        variant: 'canonical',
      },
      { ts: '2026-09-27T09:00:01.000Z', agentId: 'executor-lead', hit: false, playbookId: null, variant: null },
    ]);
  });

  it('старый формат hit без name/variant → playbookId/variant null', () => {
    const { rows, malformedLines } = parseRouterLog(
      '2026-09-01T00:00:00.000Z agent-id=apprentice playbook=hit injected=yes'
    );
    expect(malformedLines).toBe(0);
    expect(rows).toEqual([
      { ts: '2026-09-01T00:00:00.000Z', agentId: 'apprentice', hit: true, playbookId: null, variant: null },
    ]);
  });

  it('мусорная строка → malformedLines; валидные строки вокруг парсятся', () => {
    const text = [
      'this is not a router line at all',
      '2026-09-27T09:00:00.000Z agent-id=w1 playbook=miss injected=no',
      '2026-09-27T09:00:01.000Z agent-id=w2 playbook=hit name=pb-1 variant=canonical injected=yes',
    ].join('\n');
    const { rows, malformedLines } = parseRouterLog(text);
    expect(malformedLines).toBe(1);
    expect(rows.map((r) => r.agentId)).toEqual(['w1', 'w2']);
  });

  it('строка без agent-id или без playbook=hit|miss → malformed', () => {
    const text = [
      '2026-09-27T09:00:00.000Z playbook=miss injected=no', // нет agent-id
      '2026-09-27T09:00:01.000Z agent-id=w playbook=maybe', // playbook не hit|miss
      'agent-id=w playbook=miss', // нет ts-токена до первого пробела
    ].join('\n');
    expect(parseRouterLog(text)).toEqual({ rows: [], malformedLines: 3 });
  });

  it('пустой текст и пустые строки → нули, пустые строки не считаются malformed', () => {
    expect(parseRouterLog('')).toEqual({ rows: [], malformedLines: 0 });
    expect(parseRouterLog('\n  \n')).toEqual({ rows: [], malformedLines: 0 });
  });
});

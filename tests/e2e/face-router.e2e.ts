// tests/e2e/face-router.e2e.ts
// T-10 (волна 2.17): e2e-сценарии волны — доставка лиц router-плагином
// (вариант Б, T-08) через публичные поверхности (dist CLI + отрендеренный
// из templates-канона плагин; паттерн router-fallback.e2e):
// (а) мигрированное лицо резолвится router-путём (REQ-02, после T-05);
// (б) мутация лица в живом чате не меняет доставленный текст (REQ-05,
//     усиленная механика T-08 — мемоизация по session-id, не допущение);
// (в) respawn после TTL — актуальная версия (NFR-01, версионированный кэш).
// Время для TTL — патч Date.now в процессе драйвера (паттерн fake Date из
// тест-плана §Прогоны); всё остальное — реальные спавны dist CLI.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'child_process';
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, chmodSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import yaml from 'js-yaml';
import { ensureBuilt, runCli } from './helpers.js';

ensureBuilt();

const REPO = join(dirname(fileURLToPath(import.meta.url)), '../..');
const cli = join(REPO, 'dist', 'bootstrap', 'cli.js');

// Уникальные владельцы и непересекающиеся маркеры тел (как в P106-пробах):
// toContain маркера одной версии не совпадает с другой.
const MIG_OWNER = 'face-mig-probe';
const LEGACY_ID = 'mem_20261013_face_mig_probe_legacy_a1b2c3'; // формат mem_валидатор
const LIVE_OWNER = 'face-live-probe';
const TTL_OWNER = 'face-ttl-probe';
const MIG_MARKER = 'facemig-body-alpha';
const LIVE_V1 = 'liveprobe-body-alpha';
const LIVE_V2 = 'liveprobe-body-beta';
const TTL_V1 = 'ttlprobe-body-gamma';
const TTL_V2 = 'ttlprobe-body-delta';
const CREATED = '2026-10-13T10:00:00Z';

/** Драйвер в tmp-проекте: импортирует ОТРЕНДЕРЕННЫЙ плагин (как router-fallback),
 *  сценарий — argv. Публикация v2 — реальный спавн dist CLI (Стюард: WOLF_ACTOR,
 *  без WOLF_SESSION — мутация вне живого чата). Печатает `E2E-RESULT {json}`. */
const DRIVER = `
const { spawnSync } = await import('node:child_process');
const mod = await import(new URL('./.opencode/plugins/wolf-router.ts', import.meta.url).href);
const scenario = process.argv[2];
const agentId = process.argv[3];
const m1 = process.argv[4] ?? '';
const m2 = process.argv[5] ?? '';
const HEADER = '# Актуальный playbook';
const mkOutput = () => ({ system: ['agent-id: ' + agentId + '\\n\\nРоль: рамка агента.'] });
const transform = async (plugin, o) => await plugin['experimental.chat.system.transform']({}, o);
const probe = (o) => {
  const text = o.system.filter((p) => String(p).includes(HEADER)).join('\\n');
  return { parts: o.system.filter((p) => String(p).includes(HEADER)).length, v1: text.includes(m1), v2: text.includes(m2) };
};
const publishV2 = (owner, marker) => {
  const env = { ...process.env, WOLF_ACTOR: 'agent:steward' };
  delete env.WOLF_SESSION; // публикация — стюард-контекст, не живой чат
  return spawnSync(
    process.execPath,
    [
      process.env.WOLF_E2E_CLI, 'face', 'new', owner,
      '--reason', 'wave 2.17 T-10 e2e: publish v2',
      '--body', '# e2e face body ' + marker,
      '--title', owner + ' playbook v2',
      '--tags', owner + ',playbook',
      '--minimal-change', 'body version bump (e2e)',
      '--boundaries', 'agent frame and mandate stay',
      '--example-helps', 'wave 2.17 e2e scenario',
      '--example-keep', 'delivery idempotency',
      '--verification', 'wave 2.17 face-router e2e',
      '--rollback', 'wolf face restore --from v1',
    ],
    { cwd: process.cwd(), encoding: 'utf-8', timeout: 60000, env }
  );
};
const report = {};
if (scenario === 'resolve') {
  process.env.WOLF_SESSION = 'opc-e2e-resolve';
  const plugin = await mod.default.server();
  const out = mkOutput();
  await transform(plugin, out);
  const parts = out.system.filter((p) => String(p).includes(HEADER));
  report.resolve = { parts: parts.length, text: parts[0] ?? null };
} else if (scenario === 'live') {
  process.env.WOLF_SESSION = 'opc-e2e-live';
  const plugin = await mod.default.server();
  const out1 = mkOutput();
  await transform(plugin, out1);
  report.first = probe(out1);
  report.publish = publishV2(agentId, m2);
  const out2 = mkOutput(); // пересобранный system БЕЗ инъекции (живой чат)
  await transform(plugin, out2);
  report.second = probe(out2);
} else if (scenario === 'ttl') {
  const t0 = Date.now();
  let offset = 0;
  Date.now = () => t0 + offset; // TTL-кэш плагина честно истекает (fake Date)
  process.env.WOLF_SESSION = 'opc-e2e-ttl-s1';
  let plugin = await mod.default.server();
  const out1 = mkOutput();
  await transform(plugin, out1);
  report.first = probe(out1);
  report.publish = publishV2(agentId, m2);
  offset = 6 * 60_000; // TTL 5 мин истёк
  process.env.WOLF_SESSION = 'opc-e2e-ttl-s2'; // respawn: новая сессия
  plugin = await mod.default.server();
  const out2 = mkOutput();
  await transform(plugin, out2);
  report.second = probe(out2);
}
console.log('E2E-RESULT ' + JSON.stringify(report));
`;

interface ProbeResult {
  parts: number;
  v1: boolean;
  v2: boolean;
}
interface DriverReport {
  resolve?: { parts: number; text: string | null };
  first?: ProbeResult;
  second?: ProbeResult;
  publish?: { status: number | null; stdout: string; stderr: string };
}

describe('wave 2.17 face-router e2e: лицо + router-доставка (T-10)', () => {
  let root: string;
  let project: string;
  let bin: string;
  let log: string;
  let liveV1Id: string;
  let ttlV1Id: string;

  /** Legacy playbook-запись (alias playbook → note+howto, каталог shared/playbooks):
   *  миграция T-05 переносит её в face дословно (ADR-4: совместимость FTS). */
  function writeLegacyPlaybook(): void {
    const fm = {
      id: LEGACY_ID,
      title: `${MIG_OWNER} playbook v1 — legacy e2e fixture`,
      status: 'active',
      review_state: 'accepted',
      confidence: 'medium',
      importance: 0.5,
      created_at: CREATED,
      updated_at: CREATED,
      created_by: 'user:e2e',
      schema_version: 1,
      source: { kind: 'manual' },
      related: { files: [], docs: [], decisions: [] },
      tags: [MIG_OWNER, 'playbook'],
      superseded_by: null,
      type: 'playbook',
      owner_skill: MIG_OWNER,
    };
    const dir = join(project, '.wolf', 'memory', 'shared', 'playbooks');
    mkdirSync(dir, { recursive: true });
    const body = `# Playbook ${MIG_OWNER} v1\n\ne2e legacy body marker: ${MIG_MARKER}`;
    writeFileSync(join(dir, `${LEGACY_ID}.md`), `---\n${yaml.dump(fm).trimEnd()}\n---\n\n${body}\n`);
  }

  /** v1 лица через Стюард-путь (guard: WOLF_ACTOR=agent:steward); title/tags с
   *  owner+playbook попадают в FTS — router ищет «<agent-id> playbook». */
  function faceNewV1(owner: string, marker: string): string {
    const r = runCli(
      [
        'face',
        'new',
        owner,
        '--reason',
        'wave 2.17 T-10 e2e: seed v1',
        '--body',
        `# e2e face body ${marker}`,
        '--title',
        `${owner} playbook v1`,
        '--tags',
        `${owner},playbook`,
        '--minimal-change',
        'body version bump (e2e)',
        '--boundaries',
        'agent frame and mandate stay',
        '--example-helps',
        'wave 2.17 e2e scenario',
        '--example-keep',
        'delivery idempotency',
        '--verification',
        'wave 2.17 face-router e2e',
        '--rollback',
        'wolf face restore --from v1',
      ],
      project,
      { WOLF_ACTOR: 'agent:steward' }
    );
    expect(r.status, r.stderr).toBe(0);
    return faceIdOf(r.stdout);
  }

  function faceIdOf(out: string, label = 'face id'): string {
    const id = /Created face \S+ v\d+ (mem_[\w-]+)/.exec(out)?.[1];
    expect(id, `${label}: ${out}`).toBeTruthy();
    return id!;
  }

  function drive(
    scenario: string,
    agentId: string,
    ...markers: string[]
  ): {
    stdout: string;
    stderr: string;
    status: number | null;
  } {
    return spawnSync('node', ['--experimental-strip-types', 'driver.mjs', scenario, agentId, ...markers], {
      cwd: project,
      encoding: 'utf-8',
      timeout: 60_000,
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH}`,
        WOLF_ROUTER_LOG: log,
        WOLF_E2E_CLI: cli,
      },
    });
  }

  function parseReport(stdout: string): DriverReport {
    const raw = /E2E-RESULT (.+)/.exec(stdout)?.[1];
    expect(raw, `driver output: ${stdout}`).toBeTruthy();
    return JSON.parse(raw!) as DriverReport;
  }

  const routerLogLines = (): string[] => {
    try {
      return readFileSync(log, 'utf-8').trim().split('\n').filter(Boolean);
    } catch {
      return [];
    }
  };
  const lastLineFor = (agentId: string): string =>
    (
      routerLogLines()
        .filter((l) => l.includes(`agent-id=${agentId} `))
        .at(-1) ?? ''
    ).replace(/^\S+ /, '');

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'wolf-face-router-'));
    project = join(root, 'project');
    mkdirSync(project);
    writeFileSync(join(project, 'package.json'), '{ "name": "face-router-e2e" }');
    const xdg = join(root, 'xdg');
    mkdirSync(xdg);

    // init --full: сеет base-set (лица, T-05) и рендерит плагин из templates-канона
    const init = spawnSync('node', [cli, 'init', '--full', '--model', 'zai-coding-plan/glm-5.3'], {
      cwd: project,
      encoding: 'utf-8',
      timeout: 60_000,
      env: (() => {
        const { npm_command: _drop, ...rest } = process.env;
        return { ...rest, XDG_CONFIG_HOME: xdg };
      })(),
    });
    expect(init.status, init.stderr).toBe(0);
    expect(init.stdout).toMatch(/- base set: \S+ created/);

    writeLegacyPlaybook();

    // PATH-shim: плагин зовёт глобальный `wolf` → перехватываем на dist CLI
    bin = join(root, 'bin');
    mkdirSync(bin);
    writeFileSync(join(bin, 'wolf'), `#!/bin/sh\nexec node "${cli}" "$@"\n`);
    chmodSync(join(bin, 'wolf'), 0o755);

    writeFileSync(join(project, 'driver.mjs'), DRIVER);
    log = join(root, 'router.log');

    liveV1Id = faceNewV1(LIVE_OWNER, LIVE_V1);
    ttlV1Id = faceNewV1(TTL_OWNER, TTL_V1);
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('(а) мигрированное лицо резолвится router-путём (REQ-02, после T-05)', () => {
    const migrate = runCli(['face', 'migrate'], project);
    expect(migrate.status, migrate.stderr).toBe(0);
    const faceId = new RegExp(`Migrated ${MIG_OWNER} -> (mem_[\\w-]+)`).exec(migrate.stdout)?.[1];
    expect(faceId, migrate.stdout).toBeTruthy();

    // router-путь: тот же search-вызов, что делает плагин, видит face-запись;
    // superseded legacy-head скрыт (--hide-superseded)
    const search = runCli(['search', MIG_OWNER, 'playbook', '--hide-superseded'], project);
    expect(search.status).toBe(0);
    expect(search.stdout).toContain(faceId!);
    expect(search.stdout).not.toContain(LEGACY_ID);

    // доставка отрендеренным плагином: каноническое лицо, тело дословно (ADR-4)
    const r = drive('resolve', MIG_OWNER);
    expect(r.status, r.stderr).toBe(0);
    const rep = parseReport(r.stdout);
    expect(rep.resolve?.parts).toBe(1);
    expect(rep.resolve?.text).toContain(MIG_MARKER);
    expect(lastLineFor(MIG_OWNER)).toMatch(
      new RegExp(
        `^agent-id=${MIG_OWNER} playbook=hit name=${faceId} variant=canonical source=face resolution=unique ` +
          `face_id=${faceId} version=\\S+ hash=\\S+ session=\\S+ injected=yes ms=\\d+ bytes=\\d+$`
      )
    );
  });

  it('(б) мутация лица в живом чате не меняет доставленный текст (REQ-05, механика T-08)', () => {
    const r = drive('live', LIVE_OWNER, LIVE_V1, LIVE_V2);
    expect(r.status, r.stderr).toBe(0);
    const rep = parseReport(r.stdout);
    expect(rep.publish?.status, rep.publish?.stderr).toBe(0); // v2 опубликована
    const v2Id = faceIdOf(rep.publish?.stdout ?? '', 'v2 face id');

    expect(rep.first?.parts).toBe(1); // сессия получила v1
    expect(rep.first?.v1).toBe(true);
    expect(rep.first?.v2).toBe(false);

    // пересборка system в ТОЙ ЖЕ сессии: ровно одна инъекция, текст остался v1
    expect(rep.second?.parts).toBe(1);
    expect(rep.second?.v1).toBe(true);
    expect(rep.second?.v2).toBe(false);

    // механика, не допущение: повторная доставка — из мемо-кэша сессии без
    // ре-резолва (router.log: ms=0, имя запечатанной v1 — не опубликованной v2)
    const lines = routerLogLines().filter((l) => l.includes(`agent-id=${LIVE_OWNER} `));
    expect(lines).toHaveLength(2);
    expect(lines[1]).toMatch(
      new RegExp(
        `name=${liveV1Id} variant=canonical source=face resolution=unique face_id=${liveV1Id} ` +
          `version=\\S+ hash=\\S+ session=\\S+ injected=yes ms=0 bytes=\\d+$`
      )
    );
    expect(lines[1]).not.toContain(v2Id);
  });

  it('(в) respawn после TTL — актуальная версия (NFR-01, версионированный кэш T-08)', () => {
    const r = drive('ttl', TTL_OWNER, TTL_V1, TTL_V2);
    expect(r.status, r.stderr).toBe(0);
    const rep = parseReport(r.stdout);
    expect(rep.publish?.status, rep.publish?.stderr).toBe(0);
    const v2Id = faceIdOf(rep.publish?.stdout ?? '', 'v2 face id');

    expect(rep.first?.parts).toBe(1); // S1 получила v1
    expect(rep.first?.v1).toBe(true);

    // S2 после истечения TTL: доставлена АКТУАЛЬНАЯ версия (v2), не кэш-запись v1
    expect(rep.second?.parts).toBe(1);
    expect(rep.second?.v2).toBe(true);
    expect(rep.second?.v1).toBe(false);
    const lines = routerLogLines().filter((l) => l.includes(`agent-id=${TTL_OWNER} `));
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatch(new RegExp(`name=${ttlV1Id} variant=canonical`)); // S1 → v1
    expect(lines[1]).toMatch(
      new RegExp(
        `name=${v2Id} variant=canonical source=face resolution=unique face_id=${v2Id} ` +
          `version=\\S+ hash=\\S+ session=\\S+ injected=yes ms=\\d+ bytes=\\d+$`
      )
    ); // S2 → v2
  });
});

// e2e SC-01 (REQ-01 AC, design §4.7): the session-language rule carrier is
// delivered. Catches the rule dropping out of the always-delivered AGENTS.md
// during translation/rendering of the base set. The rule itself is behavioral
// (detect once, record a decision) and is covered by the demo scenario; this
// test pins the delivery surface only.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { rmSync, writeFileSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { ensureBuilt, runCli, tmpProject } from './helpers.js';

describe('delivery language rule: Session language section delivered (SC-01)', () => {
  let cwd: string;

  beforeAll(() => {
    ensureBuilt();
    cwd = tmpProject();
    writeFileSync(join(cwd, 'package.json'), JSON.stringify({ name: 'lang-app', scripts: { test: 'echo ok' } }));
  });

  afterAll(() => rmSync(cwd, { recursive: true, force: true }));

  it('init delivers AGENTS.md with the Session language section', () => {
    // vitest наследует npm_command=exec от npm, а init treats that as an npx
    // try-out (spec §7: base set not written). An installed-wolf run is the
    // delivery scenario, so the env is pinned to a non-npx npm command.
    const r = runCli(['init', '--model', 'zai-coding-plan/glm-5.3'], cwd, { npm_command: 'install' });
    const listing = readdirSync(cwd).join(',');
    expect(r.status, `init stdout: ${r.stdout}\ninit stderr: ${r.stderr}\ncwd: ${listing}`).toBe(0);
    expect(listing, `cwd after init: ${listing}`).toContain('AGENTS.md');

    const agents = readFileSync(join(cwd, 'AGENTS.md'), 'utf-8');
    // section carrier (design §4.7: presence, not wording)
    expect(agents).toContain('## Session language');
    // decision vocabulary the rule prescribes to record
    expect(agents).toContain('Session language: <lang>');
    // delivery-artifacts invariant of the rule (design §4.7)
    expect(agents).toContain('always stay English');
  });

  it('re-init keeps the section (marker-append does not drop foreign content)', () => {
    // second init on a live project must not remove the rule from AGENTS.md
    const r = runCli(['init', '--yes', '--model', 'zai-coding-plan/glm-5.3'], cwd, {
      npm_command: 'install',
    });
    expect(r.status, `re-init stdout: ${r.stdout}\nre-init stderr: ${r.stderr}`).toBe(0);
    const agents = readFileSync(join(cwd, 'AGENTS.md'), 'utf-8');
    expect(agents).toContain('## Session language');
  });
});

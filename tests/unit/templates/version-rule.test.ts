// V-1 (test-plan волны 2.16.2): версионное правило полного X.Y.Z в AGENTS.md-шаблоне.
// Oracle: mem_20261012_nomer_versii — «Номер версии всегда полный X.Y.Z — в планах,
// тредах, волнах, тегах и разговоре»; голый минор запрещён как имя релиза/волны.
import { readFileSync } from 'fs';
import { join } from 'path';
import { templatesRoot } from '../../../src/adapters/render/templates-root.js';

describe('REQ-01: версионная дисциплина в AGENTS.md-шаблоне', () => {
  const agentsMd = readFileSync(join(templatesRoot(), 'AGENTS.md'), 'utf-8');

  it('содержит правило полного X.Y.Z', () => {
    expect(agentsMd).toContain('полный X.Y.Z');
    expect(agentsMd).toContain('Номер версии');
  });

  it('содержит пример полного номера версии (не голый минор)', () => {
    expect(agentsMd).toMatch(/2\.16\.2/);
  });

  it('упоминает запрет голого минора', () => {
    expect(agentsMd).toMatch(/2\.16(?!\.\d)/); // голый минор — только как контрпример
  });
});

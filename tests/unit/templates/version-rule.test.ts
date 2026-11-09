// V-1: версионное правило полного X.Y.Z в AGENTS.md-шаблоне. Oracle:
// mem_20261012_nomer_versii — «Номер версии всегда полный X.Y.Z — в планах,
// тредах, волнах, тегах и разговоре»; голый минор запрещён как имя
// релиза/волны. Редакция S-DELIVERY 3.0.0: блок больше не хранит исторических
// примеров версий (они устаревают и требуют правки шаблона на каждом релизе) —
// guard проверяет дисциплину и отсутствие голых миноров.
import { readFileSync } from 'fs';
import { join } from 'path';
import { templatesRoot } from '../../../src/adapters/render/templates-root.js';

describe('REQ-01: версионная дисциплина в AGENTS.md-шаблоне', () => {
  const agentsMd = readFileSync(join(templatesRoot(), 'AGENTS.md'), 'utf-8');

  it('содержит правило полного X.Y.Z', () => {
    expect(agentsMd).toContain('полный X.Y.Z');
    expect(agentsMd).toContain('Номер версии');
  });

  it('не хранит исторических версий и голых миноров (примеры не устаревают)', () => {
    expect(agentsMd).not.toMatch(/2\.16/); // исторические пины версий не хранятся в блоке
    expect(agentsMd).not.toMatch(/«\d+\.\d+»/); // голый минор не появляется даже как контрпример
    expect(agentsMd).toMatch(/\bX\.Y\.Z\b/);
  });
});

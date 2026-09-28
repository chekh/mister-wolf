/**
 * T003 (волна 0 dogfooding-hardening, спека §8): толерантный парсер .wolf/router.log.
 * Пишет плагин wolf-router (templates/opencode/plugins/wolf-router.ts):
 *   `<ISO> agent-id=<id> playbook=hit name=<mem-id> variant=canonical injected=yes`
 *   `<ISO> agent-id=<id> playbook=miss injected=no`
 * Старые файлы могут не иметь name/variant. Парсинг k=v парами (не позиционно),
 * чтобы пережить будущие поля; строка валидна ⇔ есть agent-id И playbook=hit|miss.
 * Битая строка не роняет аналитику — только malformedLines (прецедент readJsonl).
 */

export interface RouterLogRow {
  ts: string;
  agentId: string;
  hit: boolean;
  playbookId: string | null;
  variant: string | null;
}

export function parseRouterLog(text: string): { rows: RouterLogRow[]; malformedLines: number } {
  const rows: RouterLogRow[] = [];
  let malformedLines = 0;
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (trimmed === '') continue;
    const row = parseLine(trimmed);
    if (row === null) malformedLines += 1;
    else rows.push(row);
  }
  return { rows, malformedLines };
}

/** ts — токен до первого пробела; k=v остальное; не-k=v токены игнорируются (толерантность). */
function parseLine(line: string): RouterLogRow | null {
  const spaceIdx = line.indexOf(' ');
  if (spaceIdx <= 0) return null;
  const ts = line.slice(0, spaceIdx);
  const kv = new Map<string, string>();
  for (const token of line.slice(spaceIdx + 1).split(/\s+/)) {
    const eq = token.indexOf('=');
    if (eq > 0) kv.set(token.slice(0, eq), token.slice(eq + 1));
  }
  const agentId = kv.get('agent-id');
  const playbook = kv.get('playbook');
  if (agentId === undefined || agentId === '' || (playbook !== 'hit' && playbook !== 'miss')) return null;
  const name = kv.get('name');
  const variant = kv.get('variant');
  return {
    ts,
    agentId,
    hit: playbook === 'hit',
    playbookId: name !== undefined && name !== '' ? name : null,
    variant: variant !== undefined && variant !== '' ? variant : null,
  };
}

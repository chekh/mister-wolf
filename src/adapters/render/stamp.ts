// src/adapters/render/stamp.ts
export interface Stamp {
  base: string;
  set: string;
}

export function renderStamp(stamp: Stamp, fileName: string): string {
  if (/(\.ts|\.js|\.mjs|\.cjs)$/.test(fileName)) {
    return `// wolf:rendered base=${stamp.base} set=${stamp.set}`;
  }
  return `<!-- wolf:rendered base=${stamp.base} set=${stamp.set} -->`;
}

export function parseStamp(text: string): Stamp | null {
  const m = text.match(/(?:<!--|\/\/)\s*wolf:rendered\s+base=(\S+)\s+set=(\S+)(?:\s*-->)?/);
  return m ? { base: m[1], set: m[2] } : null;
}

export function insertStamp(source: string, stamp: Stamp, fileName: string): string {
  const line = renderStamp(stamp, fileName);
  const stripped = source.replace(/(?:<!--|\/\/)\s*wolf:rendered[^\n]*(?:\s*-->)?\n?/g, '');
  if (/^---\n/.test(stripped)) {
    const end = stripped.indexOf('\n---', 4);
    if (end !== -1) {
      const after = stripped.indexOf('\n', end + 1);
      return `${stripped.slice(0, after + 1)}${line}\n${stripped.slice(after + 1)}`;
    }
  }
  return `${line}\n${stripped}`;
}

import { join } from 'path';
import { parseArtifactFrontMatter } from './artifact-front-matter.js';
import type { ArtifactIndexFs } from './sync-artifact-index.js';

export interface ArtifactFinding {
  /** Путь относительно baseDir (или маркер, напр. `.opencode/skills/<имя>`). */
  file: string;
  message: string;
}

export interface LintArtifactsDeps {
  fs: ArtifactIndexFs;
  baseDir: string;
  /** owner_skill всех тул-объектов памяти (для призраков). */
  toolOwners: Set<string>;
  /** Имена скиллов базового набора (исключение из призраков). */
  baseSkillNames: Set<string>;
}

/** Тело документа без front-matter (regex дублирует parseArtifactFrontMatter — она тело не отдаёт). */
function bodyOf(raw: string): string {
  const m = raw.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?([\s\S]*)$/);
  return m ? m[1] : raw;
}

/** Нормализация для сравнения дубликатов: trim + lowercase + схлопывание пробелов. */
const normalize = (s: string): string => s.replace(/\s+/g, ' ').trim().toLowerCase();

/** Слаг папки фичи: `2026-10-08-x` → `x`; без датового префикса — имя целиком. */
const folderSlug = (name: string): string => name.replace(/^\d{4}-\d{2}-\d{2}-/, '');

/** Идентификатор CR-записи — первые 40 символов строки (спека §4-A3 п.6). */
const crId = (line: string): string => line.slice(0, 40);

/** Линт артефактов docs/dev (спека §4-A3): только чтение + регулярки; tolerant —
 * нечитаемое пропускается, линт никогда не бросает; находит, но не блокирует. */
export async function runArtifactLint(deps: LintArtifactsDeps): Promise<ArtifactFinding[]> {
  const { fs, baseDir, toolOwners, baseSkillNames } = deps;
  const findings: ArtifactFinding[] = [];

  const readOrNull = async (p: string): Promise<string | null> => {
    try {
      return await fs.readFile(p);
    } catch {
      return null;
    }
  };
  /** Tolerant listDir: нет каталога/ошибка → [] (адаптер уже самогейтится через existsSync). */
  const listDirSafe = async (p: string): Promise<string[]> => {
    try {
      return await fs.listDir(p);
    } catch {
      return [];
    }
  };

  // 12. Скиллы-призраки — независимо от наличия docs/dev.
  for (const name of await listDirSafe(join(baseDir, '.opencode', 'skills'))) {
    if (!toolOwners.has(name) && !baseSkillNames.has(name)) {
      findings.push({
        file: `.opencode/skills/${name}`,
        message: `скилл-призрак: .opencode/skills/${name}/ без тул-объекта в памяти (wolf add --type tool)`,
      });
    }
  }

  const devDir = join(baseDir, 'docs', 'dev');
  try {
    if (!(await fs.exists(devDir))) return findings;
  } catch {
    return findings;
  }

  const devEntries = (await listDirSafe(devDir)).sort();
  const featureFolders = devEntries.filter((n) => !n.endsWith('.md') && n !== 'roadmap');
  const waveNames = devEntries.filter((n) => n.startsWith('wave-') && n.endsWith('.md'));

  // Волны/роадмап: все wave-*.md в docs/dev + *.md в docs/dev/roadmap/.
  const globalDocs: { rel: string; raw: string }[] = [];
  for (const name of waveNames) {
    const raw = await readOrNull(join(devDir, name));
    if (raw !== null) globalDocs.push({ rel: `docs/dev/${name}`, raw });
  }
  const roadmapDir = join(devDir, 'roadmap');
  for (const name of (await listDirSafe(roadmapDir)).sort()) {
    if (!name.endsWith('.md')) continue;
    const raw = await readOrNull(join(roadmapDir, name));
    if (raw !== null) globalDocs.push({ rel: `docs/dev/roadmap/${name}`, raw });
  }

  // 9. Дубли роадмапа: один нормализованный пункт ^- в двух файлах.
  const firstSeen = new Map<string, string>();
  const reportedItems = new Set<string>();
  for (const doc of globalDocs) {
    for (const line of doc.raw.split('\n')) {
      if (!/^- /.test(line)) continue;
      const key = normalize(line);
      const first = firstSeen.get(key);
      if (first && first !== doc.rel && !reportedItems.has(key)) {
        reportedItems.add(key);
        findings.push({
          file: doc.rel,
          message: `пункт роадмапа в двух файлах: "${key.slice(0, 60)}" — ${first}, ${doc.rel}`,
        });
      } else if (!first) {
        firstSeen.set(key, doc.rel);
      }
    }
  }

  // 10a. Released-файл: слаг пункта без папки docs/dev/*-<слаг>.
  for (const doc of globalDocs) {
    if (parseArtifactFrontMatter(doc.raw).status !== 'released') continue;
    for (const line of doc.raw.split('\n')) {
      const m = line.match(/^- (.+)$/);
      if (!m) continue;
      const slug = m[1].split(/[\s—:]+/)[0] ?? '';
      if (slug === '') continue;
      if (!featureFolders.some((f) => f === slug || f.endsWith(`-${slug}`))) {
        findings.push({ file: doc.rel, message: `волна ${doc.rel}: у фичи ${slug} нет папки фичи` });
      }
    }
  }

  // Правила 2–8 — по requirements.md папки фичи; 3/11 — по спутникам (requirements не нужен).
  for (const folder of featureFolders) {
    const folderPath = join(devDir, folder);
    const reqRel = `docs/dev/${folder}/requirements.md`;
    const reqRaw = await readOrNull(join(folderPath, 'requirements.md'));
    const reqIds = new Set<string>();

    if (reqRaw !== null) {
      const reqMeta = parseArtifactFrontMatter(reqRaw);
      const reqBody = bodyOf(reqRaw);
      const reqLines = reqBody.split('\n');

      // 2. Дубли ID в requirements.md.
      const ids: string[] = [];
      for (const line of reqLines) {
        const m = line.match(/^###\s+(REQ|NFR)-(\d{2})\b/);
        if (m) ids.push(`${m[1]}-${m[2]}`);
      }
      for (const id of ids) reqIds.add(id);
      const idSeen = new Set<string>();
      for (const id of ids) {
        if (idSeen.has(id)) {
          findings.push({ file: reqRel, message: `${id} дублируется в ${folder}/requirements.md` });
        } else {
          idSeen.add(id);
        }
      }

      // 4. Блоки REQ: AC:/Источник:; 8. Дубли текста требований.
      const blocks = reqBody.split(/^###\s+/m).slice(1);
      const reqTexts = new Map<string, string>();
      for (const block of blocks) {
        const m = block.match(/^(REQ|NFR)-(\d{2})/);
        if (!m) continue;
        const id = `${m[1]}-${m[2]}`;
        const blockBody = block.slice(m[0].length);
        if (!blockBody.split('\n').some((l) => l.includes('AC:'))) {
          findings.push({ file: reqRel, message: `${id}: нет строки "AC:"` });
        }
        if (!blockBody.split('\n').some((l) => l.includes('Источник:'))) {
          findings.push({ file: reqRel, message: `${id}: нет строки "Источник:"` });
        }
        for (const line of blockBody.split('\n')) {
          const tm = line.match(/^- Требование:\s*(.+)$/);
          if (!tm) continue;
          const key = normalize(tm[1]);
          const firstId = reqTexts.get(key);
          if (firstId && firstId !== id) {
            findings.push({
              file: reqRel,
              message: `дубликат требования: "${key.slice(0, 60)}" (${firstId} ↔ ${id})`,
            });
          } else if (!firstId) {
            reqTexts.set(key, id);
          }
        }
      }

      // 5. НЕОПРЕДЕЛЕНО в approved-документе.
      if (reqMeta.status === 'approved' && reqBody.includes('[НЕОПРЕДЕЛЕНО')) {
        findings.push({
          file: reqRel,
          message: `[НЕОПРЕДЕЛЕНО в approved-документе: ${reqRel} — убери плейсхолдер или верни статус в draft`,
        });
      }

      // 6. CR без downstream-отметки; 7. Сброс downstream (§6.7).
      for (const line of reqLines) {
        if (!/^- CR-/.test(line)) continue;
        const id = crId(line);
        if (!line.includes('downstream:')) {
          findings.push({ file: reqRel, message: `${id} без downstream-отметки (${reqRel})` });
          continue;
        }
        if (reqMeta.status !== 'approved') continue;
        const lower = line.toLowerCase();
        for (const word of ['design', 'plan'] as const) {
          if (!lower.includes(word)) continue;
          const subRaw = await readOrNull(join(folderPath, `${word}.md`));
          if (subRaw === null) continue;
          if (parseArtifactFrontMatter(subRaw).status === 'approved') {
            findings.push({
              file: reqRel,
              message: `${id} требует сброса статуса ${word}.md → draft (остался approved)`,
            });
          }
        }
      }

      // 3. Битые REQ-ссылки в design/plan/test-plan.
      for (const fileName of ['design.md', 'plan.md', 'test-plan.md'] as const) {
        const raw = await readOrNull(join(folderPath, fileName));
        if (raw === null) continue;
        const refs = [...new Set(bodyOf(raw).match(/REQ-\d{2}/g) ?? [])];
        for (const ref of refs) {
          if (!reqIds.has(ref)) {
            findings.push({
              file: `docs/dev/${folder}/${fileName}`,
              message: `${ref} не найден в requirements.md (упомянут в docs/dev/${folder}/${fileName})`,
            });
          }
        }
      }
    }

    // 11. Готовность по plan.md.
    const planRaw = await readOrNull(join(folderPath, 'plan.md'));
    if (planRaw !== null) {
      const planLines = planRaw.split('\n');
      const done = planLines.filter((l) => /^\s*[-*] \[x\]/i.test(l)).length;
      const todo = planLines.filter((l) => /^\s*[-*] \[ \]/.test(l)).length;
      if (done > 0 && todo === 0 && parseArtifactFrontMatter(planRaw).status === 'approved') {
        findings.push({
          file: `docs/dev/${folder}/plan.md`,
          message: `${folder} готова к релизу (все задачи закрыты, план approved)`,
        });
      } else if (done > 0 && todo > 0) {
        findings.push({
          file: `docs/dev/${folder}/plan.md`,
          message: `${folder} в работе (закрыто ${done} из ${done + todo} задач)`,
        });
      }
    }
  }

  // 10b. Папка фичи, слаг которой не упомянут ни в одном wave/roadmap-файле.
  const waveText = globalDocs.map((d) => d.raw).join('\n');
  for (const folder of featureFolders) {
    const slug = folderSlug(folder);
    if (slug === '') continue;
    if (!waveText.includes(slug)) {
      findings.push({ file: `docs/dev/${folder}`, message: `${folder} не упомянута в файлах волн` });
    }
  }

  return findings;
}

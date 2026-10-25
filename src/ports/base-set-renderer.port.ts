// src/ports/base-set-renderer.port.ts
// Единственный владелец контракта рендерера base-set (design §4.6 волны 2.20.0):
// классификация цели (protect, штамп-исцеление, mutated, kept, take), read-only
// инспекция, реестр защит и эталон одного файла.
export type RenderAction = 'created' | 'appended' | 'skipped' | 'updated' | 'conflict';

export interface RenderOutcome {
  file: string;
  action: RenderAction;
  reason?: string;
  /** 2.19.0 (design §«Сверка»): структурный флаг mutated-skip — сверка
   *  verifyAgainstMap различает skipped-identical / skipped-mutated полем,
   *  не парсингом reason-строки. */
  mutated?: boolean;
  /** Правило 2 §4.3: файл держится ключом protect, не тронут (вне needs-decision). */
  protected?: true;
  /** Значение ключа для дайджеста (`true` | `X.Y.Z` | raw вне грамматики). */
  protect?: string | true;
  /** Правило 6.5 §4.3: принятый локальный контент (origin:'keep'), файл не менялся. */
  kept?: true;
  /** Путь бэкапа, если файл был перезаписан по режиму take-on-mutated (§4.12). */
  backup?: string;
}

/** Контекст подстановки моделей (onboarding v2, §4.5): {{model.primary}} / {{model.worker}}. */
export interface ModelContext {
  primary: string;
  worker: string;
}

/** Действие read-only инспекции цели (T10, REQ-08, design §«--check»): цель
 *  сверяется с текущим рендером без единой записи на диск. foreign — unstamped
 *  файл на месте цели (wx-политика: чужое, вне покрытия). protected/kept —
 *  защищённая вариация и принятый локальный контент: не решения (§4.6). */
export type InspectAction =
  | 'identical'
  | 'differs'
  | 'missing'
  | 'mutated'
  | 'foreign'
  | 'unknown'
  | 'protected'
  | 'kept';

export interface InspectOutcome {
  /** rel-путь от baseDir — тот же ключ, что RenderOutcome.file. */
  file: string;
  action: InspectAction;
  protected?: true;
  protect?: string | true;
  kept?: true;
  /** База, на которой владелец принял локальный контент (правило 6.5 §4.3). */
  keepBase?: string;
  /** Причина наблюдения для человека (`onboarding markers broken`, …); в classify
   *  и `--check` передаётся полем, а не разбором reason-строки (§4.15). */
  detail?: string;
}

/** Хук бэкапа: приложение решает, куда и как копировать; рендерер только
 *  требует «сначала бэкап, потом запись» (NFR-05). Возвращает путь бэкапа. */
export type BackupHook = (rel: string, content: string) => Promise<string>;

export interface SyncBaseSetOptions {
  /** --yes (§4.12): mutated → бэкап + эталон. Без хука режим запрещён. */
  takeMutated?: { backup: BackupHook };
}

export interface BakeResolver {
  /** Вернуть тело playbook'а для вживления (bake-in) или null. Источник — память целевого проекта (§4). */
  (baseName: string): string | null;
}

export interface RenderBaseSetOptions {
  bake?: BakeResolver;
  /** ModelContext — явный --model (opt-in); 'omit' — model-строки вырезаются (WP2 unpin, спека 2.16 §5). */
  models?: ModelContext | 'omit';
  /** WP1 (спека 2.16 §4): 'agents-md' — только AGENTS.md (минимальный init);
   * 'full' (дефолт) — весь базовый набор. */
  scope?: 'full' | 'agents-md';
}

/** Реестр защит (`--check`, REQ-09; design §4.11): включая файлы вне карты. */
export interface ProtectEntry {
  /** Корень проекта (abs). */
  project: string;
  /** rel-путь от корня проекта. */
  file: string;
  /** `true` | `X.Y.Z` либо raw вне грамматики. */
  value: 'true' | string;
  /** false — значение вне грамматики (вывод с предупреждением). */
  recognized: boolean;
  stamp: string | null;
  /** Версия базы (map.version). */
  base: string;
  /** Нормализованный контент != fresh; null — эталона нет (файл вне карты). */
  behind: boolean | null;
}

export interface BaseSetRenderer {
  id: string;
  /** Init-рендер: create + diff-ветка (§4.5: stamped + diff контента → updated; unstamped → skipped). */
  renderBaseSet(baseDir: string, opts?: RenderBaseSetOptions): Promise<RenderOutcome[]>;
  /**
   * Sync: ре-рендер; сравнение по контенту; unstamped = conflict; orphaned-отчёт. Память не трогает.
   * models — контекст из routing-объекта; 'omit' (и undefined — легаси без routing-объекта) —
   * построчное удаление model:-строки из fresh-контента (§4.5).
   */
  syncBaseSet(
    baseDir: string,
    models?: ModelContext | 'omit',
    opts?: SyncBaseSetOptions
  ): Promise<{ outcomes: RenderOutcome[]; orphaned: string[] }>;
  /** Read-only инспекция целей base-set и AGENTS.md (`--check`, §4.6). */
  inspectBaseSet?(baseDir: string, opts?: RenderBaseSetOptions): Promise<InspectOutcome[]>;
  /** Read-only реестр защит по каталогам base-set, включая файлы вне карты (§4.11). */
  listProtections?(baseDir: string, base: string): Promise<ProtectEntry[]>;
  /** Свежий рендер одного rel-файла (эталон для `--show`/`behind`); null — файла нет в карте. */
  renderFreshFile?(baseDir: string, rel: string, opts?: RenderBaseSetOptions): string | null;
}

import { describe, it, expect } from 'vitest';
import { Command } from 'commander';
import { readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { DEFAULT_CHARACTER_FACETS, MEMORY_TYPES } from '../../../../src/domain/memory-types.js';
import { typeNamespaceCommand } from '../../../../src/adapters/cli/type-command-generator.js';
import { memoryToolCommand } from '../../../../src/adapters/cli/commands/memory-tool.js';

// Спека 2.13 §6.3/§10.2 (P222): командная поверхность type-неймспейсов
// генерируется из таксономии — «таксономия ⇒ командная поверхность» полная.

const repoSrc = join(dirname(fileURLToPath(import.meta.url)), '../../../..', 'src');

describe('type namespaces generated from taxonomy (wave 2.13 §6.3)', () => {
  it('guard 7/7: every MEMORY_TYPE has add and list subcommands', () => {
    const program = new Command('wolf');
    for (const type of MEMORY_TYPES) {
      // tool — живая обёртка: register/use/expose/... + генерённый add-синоним register
      program.addCommand(type === 'tool' ? memoryToolCommand() : typeNamespaceCommand(type));
    }
    for (const type of MEMORY_TYPES) {
      const ns = program.commands.find((c) => c.name() === type);
      expect(ns, `namespace <${type}> is registered`).toBeDefined();
      const subs = ns!.commands.map((c) => c.name());
      expect(subs, `<${type}> subcommands`).toContain('add');
      expect(subs, `<${type}> subcommands`).toContain('list');
    }
  });

  it('required declaration fields become mandatory options (thread add --goal)', () => {
    const add = typeNamespaceCommand('thread').commands.find((c) => c.name() === 'add')!;
    const goal = add.options.find((o) => o.long === '--goal');
    expect(goal).toBeDefined();
    expect(goal!.mandatory).toBe(true);
  });

  it('enum fields become mandatory choices (note add --facet from the facet dictionary)', () => {
    const add = typeNamespaceCommand('note').commands.find((c) => c.name() === 'add')!;
    const facet = add.options.find((o) => o.long === '--facet')!;
    expect(facet.mandatory).toBe(true);
    // commander хранит значения enum в argChoices
    expect(facet.argChoices).toEqual([...DEFAULT_CHARACTER_FACETS]);
  });

  it('complaint add exposes its required protocol fields', () => {
    const add = typeNamespaceCommand('complaint').commands.find((c) => c.name() === 'add')!;
    for (const flag of ['--about', '--rule', '--evidence', '--proposal']) {
      const opt = add.options.find((o) => o.long === flag);
      expect(opt, `${flag} on complaint add`).toBeDefined();
      expect(opt!.mandatory).toBe(true);
    }
  });

  // §10.2: ручных CRUD-файлов type-команд в src/adapters/cli/commands/ нет
  it('fs-guard: manual type CRUD command files are gone', () => {
    const files = new Set(readdirSync(join(repoSrc, 'adapters', 'cli', 'commands')));
    const manual = [
      'memory-decision.ts',
      'memory-rule.ts',
      'memory-blocker.ts',
      'memory-article.ts',
      'memory-thread.ts',
      'memory-info-request.ts',
    ];
    for (const name of manual) {
      expect(files.has(name), `${name} must not exist (generated namespaces replace it)`).toBe(false);
    }
  });
});

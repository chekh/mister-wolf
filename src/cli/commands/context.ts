import { Command, Option } from 'commander';
import { loadProjectConfig } from '../../config/project-config.js';
import { ContextScanner } from '../../context/scanner.js';
import { CaseMemoryReader } from '../../context/case-memory.js';
import { ContextResolver } from '../../context/resolver.js';
import { ContextBundleBuilder } from '../../context/bundle-builder.js';
import { ContextMdGenerator } from '../../context/md-generator.js';
import { InProcessEventBus } from '../../kernel/event-bus.js';
import { CaseStore } from '../../state/case-store.js';
import { join, dirname } from 'path';
import { mkdirSync, writeFileSync } from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { RuntimeEvent } from '../../types/events.js';
import { ContextConfig } from '../../config/project-config.js';

function createEvent(type: string, caseId: string, payload: Record<string, unknown> = {}): RuntimeEvent {
  return {
    id: uuidv4(),
    type,
    case_id: caseId,
    timestamp: new Date().toISOString(),
    actor: { type: 'system', id: 'context-builder' },
    payload,
  };
}

function getEffectiveConfig(config: ContextConfig, scenarioId?: string): ContextConfig {
  if (!scenarioId) return config;
  const scenario = config.scenarios.find((s) => s.id === scenarioId);
  if (!scenario || !scenario.context) return config;

  return {
    ...config,
    include: scenario.context.include ?? config.include,
    exclude: scenario.context.exclude ?? config.exclude,
    limits: scenario.context.limits ? { ...config.limits, ...scenario.context.limits } : config.limits,
  };
}

function validateScenario(config: ContextConfig, scenarioId?: string): void {
  if (!scenarioId) return;
  const scenario = config.scenarios.find((s) => s.id === scenarioId);
  if (!scenario) {
    throw new Error(`Scenario not found: ${scenarioId}`);
  }
}

export function createContextCommand(): Command {
  const context = new Command('context').description('Context resolver commands');

  context
    .command('scan')
    .description('Scan files (dry run, no persistence)')
    .option('--scenario <id>', 'Scenario ID')
    .addOption(new Option('--json', 'Output as JSON'))
    .action(async (options: { scenario?: string; json?: boolean }) => {
      const cwd = process.cwd();
      const projectConfig = loadProjectConfig();
      const contextConfig = projectConfig.context;
      const bus = new InProcessEventBus();
      const caseId = 'context-scan';

      try {
        validateScenario(contextConfig, options.scenario);
      } catch (err) {
        console.error(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }

      const effectiveConfig = getEffectiveConfig(contextConfig, options.scenario);

      await bus.publish(createEvent('context.scan.started', caseId, { scenario: options.scenario }));

      const scanner = new ContextScanner();
      const result = await scanner.scan(cwd, effectiveConfig);

      await bus.publish(
        createEvent('context.scan.completed', caseId, {
          scenario: options.scenario,
          files_scanned: result.metadata.files_scanned,
          files_included: result.metadata.files_included,
          files_skipped: result.metadata.files_skipped,
        })
      );

      if (options.json) {
        console.log(JSON.stringify(result.metadata, null, 2));
        return;
      }

      console.log(`Files scanned: ${result.metadata.files_scanned}`);
      console.log(`Files included: ${result.metadata.files_included}`);
      console.log(`Files skipped: ${result.metadata.files_skipped}`);
      console.log(`Bytes included: ${result.metadata.bytes_included}`);
      console.log(`Bytes truncated: ${result.metadata.bytes_truncated}`);
      if (result.metadata.limits_applied.length > 0) {
        console.log(`Limits applied: ${result.metadata.limits_applied.join(', ')}`);
      }
      if (result.metadata.skipped_files && result.metadata.skipped_files.length > 0) {
        console.log(`Skipped files: ${result.metadata.skipped_files.join(', ')}`);
      }
    });

  context
    .command('build')
    .description('Full build with persistence')
    .option('--scenario <id>', 'Scenario ID')
    .addOption(new Option('--json', 'Output as JSON'))
    .action(async (options: { scenario?: string; json?: boolean }) => {
      const cwd = process.cwd();
      const projectConfig = loadProjectConfig();
      const contextConfig = projectConfig.context;
      const bus = new InProcessEventBus();
      const stateDir = join(cwd, '.wolf', 'state');
      const caseStore = new CaseStore(stateDir);
      const caseId = 'context-build';

      try {
        validateScenario(contextConfig, options.scenario);
      } catch (err) {
        console.error(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }

      const effectiveConfig = getEffectiveConfig(contextConfig, options.scenario);

      await bus.publish(createEvent('context.scan.started', caseId, { scenario: options.scenario }));

      const scanner = new ContextScanner();
      const scanResult = await scanner.scan(cwd, effectiveConfig);

      await bus.publish(
        createEvent('context.scan.completed', caseId, {
          scenario: options.scenario,
          files_scanned: scanResult.metadata.files_scanned,
          files_included: scanResult.metadata.files_included,
          files_skipped: scanResult.metadata.files_skipped,
        })
      );

      const caseMemoryReader = new CaseMemoryReader();
      const casesDir = join(stateDir, 'cases');
      const caseMemory = caseMemoryReader.read(casesDir, effectiveConfig);

      await bus.publish(
        createEvent('context.case_memory.read', caseId, {
          cases_read: caseMemory.metadata.cases_read,
          total_cases: caseMemory.metadata.total_cases,
        })
      );

      const resolver = new ContextResolver();
      const resolved = resolver.resolve(scanResult, caseMemory, effectiveConfig, options.scenario);

      const bundleBuilder = new ContextBundleBuilder();
      const bundle = bundleBuilder.build(resolved, scanResult.metadata, cwd, options.scenario || 'default');

      await bus.publish(
        createEvent('context.bundle.created', caseId, {
          scenario: bundle.scenario,
          file_count:
            bundle.project.files.length +
            bundle.project.docs.length +
            bundle.project.rules.length +
            bundle.project.configs.length,
          case_count: bundle.case_memory.cases.length,
        })
      );

      // Write outputs
      const bundlePath = join(cwd, contextConfig.output.bundle);
      const markdownPath = join(cwd, contextConfig.output.markdown);

      mkdirSync(dirname(bundlePath), { recursive: true });
      writeFileSync(bundlePath, JSON.stringify(bundle, null, 2));

      const mdGenerator = new ContextMdGenerator();
      const markdown = mdGenerator.generate(bundle, contextConfig.markdown_render_chars);
      writeFileSync(markdownPath, markdown);

      if (options.json) {
        console.log(JSON.stringify(bundle, null, 2));
        return;
      }

      console.log(`Context bundle written to: ${bundlePath}`);
      console.log(`Context markdown written to: ${markdownPath}`);
      console.log(`Files: ${bundle.project.files.length}`);
      console.log(`Docs: ${bundle.project.docs.length}`);
      console.log(`Rules: ${bundle.project.rules.length}`);
      console.log(`Configs: ${bundle.project.configs.length}`);
      console.log(`Cases: ${bundle.case_memory.cases.length}`);
    });

  return context;
}

import { z } from 'zod';
import yaml from 'js-yaml';
import { readFileSync, existsSync } from 'fs';

export const ContextConfigSchema = z.object({
  include: z
    .array(z.string())
    .default(['src/**/*', 'tests/**/*', 'docs/**/*.md', 'README.md', 'AGENTS.md', 'examples/**/*']),
  exclude: z
    .array(z.string())
    .default([
      'node_modules/**',
      'dist/**',
      '.git/**',
      '.wolf/state/**',
      '.wolf/context/**',
      'coverage/**',
      '.worktrees/**',
    ]),
  limits: z
    .object({
      max_files: z.number().int().positive().default(100),
      max_bytes: z.number().int().positive().default(10485760),
      max_file_bytes: z.number().int().positive().default(1048576),
      max_cases: z.number().int().positive().default(10),
    })
    .default({}),
  include_content: z.boolean().default(true),
  markdown_render_chars: z.number().int().positive().default(1000),
  output: z
    .object({
      bundle: z.string().default('.wolf/context/context-bundle.json'),
      markdown: z.string().default('.wolf/context/context.md'),
    })
    .default({}),
  scenarios: z
    .array(
      z.object({
        id: z.string(),
        match: z.object({
          keywords: z.array(z.string()),
        }),
        context: z
          .object({
            include: z.array(z.string()).optional(),
            exclude: z.array(z.string()).optional(),
            limits: z
              .object({
                max_files: z.number().int().positive().optional(),
                max_bytes: z.number().int().positive().optional(),
                max_file_bytes: z.number().int().positive().optional(),
                max_cases: z.number().int().positive().optional(),
              })
              .optional(),
          })
          .optional(),
      })
    )
    .default([]),
});

export type ContextConfig = z.infer<typeof ContextConfigSchema>;

export const ProjectConfigSchema = z.object({
  state_dir: z.string().default('.wolf/state'),
  index_path: z.string().optional(),
  context: ContextConfigSchema.default({}),
  defaults: z
    .object({
      timeout: z.string().default('30s'),
      max_parallel: z.number().int().positive().optional(),
      shell: z
        .object({
          max_output_size: z.string().default('1MB'),
          blocked_commands: z
            .array(z.string())
            .default(['sudo', 'su', 'ssh', 'vim', 'nano', 'less', 'more', 'top', 'watch']),
        })
        .optional(),
    })
    .default({}),
});

export type ProjectConfig = z.infer<typeof ProjectConfigSchema>;

export function loadProjectConfig(path?: string): ProjectConfig {
  const configPath = path || 'wolf.yaml';

  if (!existsSync(configPath)) {
    return ProjectConfigSchema.parse({});
  }

  const content = readFileSync(configPath, 'utf-8');
  const parsed = yaml.load(content);

  if (!parsed || typeof parsed !== 'object') {
    throw new Error(`Invalid config file: ${configPath}`);
  }

  return ProjectConfigSchema.parse(parsed);
}

import { z } from 'zod';
import yaml from 'js-yaml';
import { readFileSync, existsSync } from 'fs';

const ProjectConfigSchema = z.object({
  state_dir: z.string().default('.wolf/state'),
  index_path: z.string().optional(),
  defaults: z.object({
    timeout: z.string().default('30s'),
    max_parallel: z.number().int().positive().optional(),
    shell: z.object({
      max_output_size: z.string().default('1MB'),
      blocked_commands: z.array(z.string()).default(['sudo', 'su', 'ssh', 'vim', 'nano', 'less', 'more', 'top', 'watch']),
    }).optional(),
  }).default({}),
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

import { z } from 'zod';

export const ProjectSnapshotSchema = z.object({
  projectName: z.string(),
  root: z.string(),
  branch: z.string().optional(),
  commit: z.string().optional(),
  generatedAt: z.string().datetime(),
  summary: z.object({
    languages: z.array(z.string()),
    entryPoints: z.array(z.string()),
    configFiles: z.array(z.string()),
    dependencies: z.array(z.string()),
    topLevelDirectories: z.array(z.string()),
    fileCount: z.number().int().min(0),
  }),
  files: z.array(
    z.object({
      path: z.string(),
      extension: z.string().optional(),
      size: z.number().int().min(0),
    })
  ),
  docs: z.array(
    z.object({
      path: z.string(),
      title: z.string(),
    })
  ),
});

export type ProjectSnapshot = z.infer<typeof ProjectSnapshotSchema>;

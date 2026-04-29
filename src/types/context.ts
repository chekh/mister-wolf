import { z } from 'zod';

export const ContextFileSchema = z.object({
  path: z.string(),
  kind: z.enum(['project_file', 'project_doc', 'project_rule', 'project_config']),
  size: z.number(),
  extension: z.string(),
  hash: z.string(),
  mtime: z.string(),
  content_included: z.boolean(),
  content_truncated: z.boolean(),
  content: z.string().optional(),
});

export type ContextFile = z.infer<typeof ContextFileSchema>;

export const ContextCaseSchema = z.object({
  case_id: z.string(),
  workflow_id: z.string(),
  status: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
  artifact_count: z.number(),
  completed_steps: z.array(z.string()).optional(),
  failed_steps: z.array(z.string()).optional(),
});

export type ContextCase = z.infer<typeof ContextCaseSchema>;

export const ScanMetadataSchema = z.object({
  files_scanned: z.number(),
  files_included: z.number(),
  files_skipped: z.number(),
  bytes_included: z.number(),
  bytes_truncated: z.number(),
  limits_applied: z.array(z.string()),
  skipped_files: z.array(z.string()).optional(),
});

export type ScanMetadata = z.infer<typeof ScanMetadataSchema>;

export const CaseMemoryMetadataSchema = z.object({
  cases_read: z.number(),
  total_cases: z.number(),
  skipped_cases: z.array(z.string()),
});

export type CaseMemoryMetadata = z.infer<typeof CaseMemoryMetadataSchema>;

export const ResolveMetadataSchema = z.object({
  groups: z.record(z.number()),
});

export type ResolveMetadata = z.infer<typeof ResolveMetadataSchema>;

export const ContextBundleSchema = z.object({
  version: z.literal('1.0.0'),
  generated_at: z.string(),
  scenario: z.string(),
  project: z.object({
    root: z.string(),
    files: z.array(ContextFileSchema),
    docs: z.array(ContextFileSchema),
    rules: z.array(ContextFileSchema),
    configs: z.array(ContextFileSchema),
  }),
  case_memory: z.object({
    cases: z.array(ContextCaseSchema),
    count: z.number(),
    total_count: z.number(),
    metadata: CaseMemoryMetadataSchema,
  }),
  scan_metadata: ScanMetadataSchema,
  resolve_metadata: ResolveMetadataSchema,
});

export type ContextBundle = z.infer<typeof ContextBundleSchema>;

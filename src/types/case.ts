export enum CaseStatus {
  CREATED = 'created',
  PLANNED = 'planned',
  RUNNING = 'running',
  PAUSED = 'paused',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

export interface Case {
  id: string;
  title: string;
  status: CaseStatus;
  request: {
    raw: string;
    normalized?: Record<string, unknown>;
  };
  workflow_id: string;
  workflow_version?: string;
  created_at: string;
  updated_at: string;
}

export interface CaseMetadata {
  case_id: string;
  workflow_id: string;
  workflow_version: string;
  title: string;
  status: CaseStatus;
  created_at: string;
  updated_at: string;
}

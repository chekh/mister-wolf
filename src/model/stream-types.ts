export interface ModelStreamStart {
  provider: string;
  model: string;
}

export interface ModelStreamChunk {
  provider: string;
  model: string;
  chunk_index: number;
  text: string;
}

export interface ModelStreamCallbacks {
  onStart?: (event: ModelStreamStart) => void | Promise<void>;
  onChunk?: (chunk: ModelStreamChunk) => void | Promise<void>;
  onComplete?: (result: import('./types.js').ModelInvocationResult) => void | Promise<void>;
}

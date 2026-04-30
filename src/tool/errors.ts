export class ToolNotFound extends Error {
  constructor(toolId: string) {
    super(`Tool not found: ${toolId}`);
  }
}

export class ToolNotAllowed extends Error {
  constructor(toolId: string, agentId: string) {
    super(`Tool '${toolId}' not allowed for agent '${agentId}'`);
  }
}

export class ToolExecutorNotFound extends Error {
  constructor(executorId: string) {
    super(`Tool executor not found: ${executorId}`);
  }
}

export class ToolExecutionError extends Error {
  constructor(toolId: string, reason: string) {
    super(`Tool execution error (${toolId}): ${reason}`);
  }
}

export class ToolApprovalRejected extends Error {
  constructor(toolId: string, reason: string) {
    super(`Tool '${toolId}' approval rejected: ${reason}`);
  }
}

export class ContextToolError extends Error {
  constructor(reason: string) {
    super(`Context tool error: ${reason}`);
  }
}

export class ToolCallLimitExceeded extends Error {
  constructor() {
    super('Tool call limit exceeded: at most one tool call per agent step');
  }
}

export class ToolDenied extends Error {
  constructor(toolId: string, reason: string) {
    super(`Tool '${toolId}' denied by policy: ${reason}`);
  }
}

import { ToolExecutor, ToolExecutionInput, ToolExecutionResult, ToolExecutionContext } from '../types.js';
import { ContextToolError } from '../errors.js';
import { resolve } from 'path';
import { existsSync, readFileSync, statSync } from 'fs';

export class ContextReadToolExecutor implements ToolExecutor {
  id = 'context.read';

  async execute(input: ToolExecutionInput, ctx: ToolExecutionContext): Promise<ToolExecutionResult> {
    const path = (input.input as { path?: string } | undefined)?.path || '.wolf/context/context.md';

    // Validate path
    if (path.startsWith('/')) {
      throw new ContextToolError('Path must be relative');
    }
    if (path.includes('..')) {
      throw new ContextToolError('Path must not contain parent traversal');
    }

    const resolvedPath = resolve(ctx.project_root, path);
    if (!resolvedPath.startsWith(ctx.project_root)) {
      throw new ContextToolError('Path must be inside project root');
    }

    if (!existsSync(resolvedPath)) {
      throw new ContextToolError(`Context file not found: ${path}`);
    }

    const stats = statSync(resolvedPath);
    if (stats.size > 1048576) {
      throw new ContextToolError(`File exceeds 1MB limit: ${path}`);
    }

    try {
      const content = readFileSync(resolvedPath, 'utf-8');
      return {
        tool_id: this.id,
        output: content,
        metadata: { path, bytes_read: stats.size },
      };
    } catch (err) {
      throw new ContextToolError(`Failed to read file: ${path}`);
    }
  }
}

export function interpolateTemplate(template: string, variables: Record<string, unknown>): string {
  return template.replace(/\{\{\s*variables\.(\w+)\s*\}\}/g, (_match, varName) => {
    if (!(varName in variables)) {
      throw new Error(`Missing variable: ${varName}`);
    }
    return String(variables[varName]);
  });
}

export function interpolateObject(input: unknown, variables: Record<string, unknown>): unknown {
  if (typeof input === 'string') {
    return interpolateTemplate(input, variables);
  }
  if (Array.isArray(input)) {
    return input.map(item => interpolateObject(item, variables));
  }
  if (input !== null && typeof input === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input)) {
      result[key] = interpolateObject(value, variables);
    }
    return result;
  }
  return input;
}

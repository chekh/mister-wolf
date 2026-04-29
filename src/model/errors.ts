export class ProviderNotFound extends Error {
  constructor(providerId: string) {
    super(`Provider not found: ${providerId}`);
  }
}

export class ProviderAuthError extends Error {
  constructor(providerId: string) {
    super(`Provider authentication failed: ${providerId}`);
  }
}

export class ProviderRequestError extends Error {
  constructor(providerId: string, message: string) {
    super(`Provider request error (${providerId}): ${message}`);
  }
}

export class ProviderNetworkError extends Error {
  constructor(providerId: string) {
    super(`Provider network error: ${providerId}`);
  }
}

export class ContextReadError extends Error {
  constructor(path: string, reason: string) {
    super(`Context read error (${path}): ${reason}`);
  }
}

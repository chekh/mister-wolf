import { ModelRoute } from '../types/agent.js';

export class ModelRouteNotFound extends Error {
  constructor(routeId: string) {
    super(`Model route not found: ${routeId}`);
  }
}

export class ModelRouter {
  private routes = new Map<string, ModelRoute>();

  constructor(routes: Record<string, ModelRoute>) {
    for (const [id, route] of Object.entries(routes)) {
      this.routes.set(id, route);
    }
  }

  resolve(routeId: string): ModelRoute {
    const route = this.routes.get(routeId);
    if (!route) {
      throw new ModelRouteNotFound(routeId);
    }
    return route;
  }
}

import { Router } from '../router.js';
import { ok } from '../response.js';
import type { RuntimeContext } from '../types.js';

export function nodeRoutes(ctx: RuntimeContext): Router {
  const router = new Router();

  router.get('/', ({ res }) => {
    ok(res, {
      service: 'telagent-node',
      version: '0.1.0',
      now: new Date().toISOString(),
      links: {
        metrics: '/api/v1/node/metrics',
      },
    }, { self: '/api/v1/node' });
  });

  router.get('/metrics', ({ res }) => {
    const snapshot = ctx.monitoringService.snapshot();
    ok(res, snapshot, { self: '/api/v1/node/metrics' });
  });

  return router;
}

import { Router } from '../router.js';
import { ok } from '../response.js';

export function nodeRoutes(): Router {
  const router = new Router();

  router.get('/', ({ res }) => {
    ok(res, {
      service: 'telagent-node',
      version: '0.1.0',
      now: new Date().toISOString(),
    }, { self: '/api/v1/node' });
  });

  return router;
}

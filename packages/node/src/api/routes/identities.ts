import { Router } from '../router.js';
import { ok } from '../response.js';
import { handleError } from '../route-utils.js';
import type { RuntimeContext } from '../types.js';

export function identityRoutes(ctx: RuntimeContext): Router {
  const router = new Router();

  router.get('/self', async ({ res, url }) => {
    try {
      const identity = await ctx.identityService.getSelf();
      ok(res, identity, { self: '/api/v1/identities/self' });
    } catch (error) {
      handleError(res, error, url.pathname);
    }
  });

  router.get('/:did', async ({ res, params, url }) => {
    try {
      const identity = await ctx.identityService.resolve(params.did);
      ok(res, identity, { self: `/api/v1/identities/${encodeURIComponent(params.did)}` });
    } catch (error) {
      handleError(res, error, url.pathname);
    }
  });

  return router;
}

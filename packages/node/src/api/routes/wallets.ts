import { ErrorCodes, TelagentError } from '@telagent/protocol';

import { Router } from '../router.js';
import { ok } from '../response.js';
import { handleError } from '../route-utils.js';
import type { RuntimeContext } from '../types.js';

export function walletRoutes(ctx: RuntimeContext): Router {
  const router = new Router();

  router.get('/:did/gas-balance', async ({ res, params, url }) => {
    try {
      const identity = await ctx.identityService.resolve(params.did);
      const nativeBalance = await ctx.gasService.getNativeGasBalance(identity.controller);
      const tokenBalance = await ctx.gasService.getTokenBalance(identity.controller);

      ok(
        res,
        {
          did: identity.did,
          controller: identity.controller,
          nativeGasBalanceWei: nativeBalance.toString(),
          clawTokenBalance: tokenBalance.toString(),
        },
        { self: `/api/v1/wallets/${encodeURIComponent(params.did)}/gas-balance` },
      );
    } catch (error) {
      handleError(res, error, url.pathname);
    }
  });

  return router;
}

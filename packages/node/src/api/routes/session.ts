import { ErrorCodes, TelagentError } from '@telagent/protocol';

import { Router } from '../router.js';
import { noContent, ok } from '../response.js';
import { handleError } from '../route-utils.js';
import type { RuntimeContext } from '../types.js';

export function sessionRoutes(ctx: RuntimeContext): Router {
  const router = new Router();

  router.post('/unlock', async ({ res, body, url }) => {
    try {
      const payload = (body ?? {}) as {
        passphrase?: unknown;
        ttlSeconds?: unknown;
        scope?: unknown;
        maxOperations?: unknown;
      };

      if (typeof payload.passphrase !== 'string' || !payload.passphrase.trim()) {
        throw new TelagentError(ErrorCodes.VALIDATION, 'passphrase is required');
      }

      const selfDid = ctx.identityService.getSelfDid();
      const result = await ctx.sessionManager.unlock({
        passphrase: payload.passphrase,
        did: selfDid,
        ttlSeconds: typeof payload.ttlSeconds === 'number' ? payload.ttlSeconds : undefined,
        scope: Array.isArray(payload.scope)
          ? payload.scope.filter((item): item is 'transfer' | 'escrow' | 'market' | 'contract' | 'reputation' | 'identity' =>
            item === 'transfer'
            || item === 'escrow'
            || item === 'market'
            || item === 'contract'
            || item === 'reputation'
            || item === 'identity')
          : undefined,
        maxOperations: typeof payload.maxOperations === 'number' ? payload.maxOperations : undefined,
        validatePassphrase: async (_did, _passphrase) => {
          try {
            await ctx.clawnetGateway.getNonce();
            return true;
          } catch {
            return false;
          }
        },
      });

      ok(
        res,
        {
          sessionToken: result.sessionToken,
          expiresAt: result.expiresAt.toISOString(),
          scope: result.scope,
          did: selfDid,
        },
        { self: '/api/v1/session' },
      );
    } catch (error) {
      handleError(res, error, url.pathname);
    }
  });

  router.post('/lock', ({ req, res, url }) => {
    try {
      const token = extractBearerToken(req.headers);
      if (!token) {
        throw new TelagentError(ErrorCodes.UNAUTHORIZED, 'Missing Authorization header');
      }
      ctx.sessionManager.lock(token);
      noContent(res);
    } catch (error) {
      handleError(res, error, url.pathname);
    }
  });

  router.get('/', ({ req, res, url }) => {
    try {
      const token = extractBearerToken(req.headers);
      if (!token) {
        throw new TelagentError(ErrorCodes.UNAUTHORIZED, 'Missing Authorization header');
      }

      const info = ctx.sessionManager.getSessionInfo(token);
      if (!info) {
        throw new TelagentError(ErrorCodes.NOT_FOUND, 'Session not found or expired');
      }

      ok(
        res,
        {
          active: info.active,
          expiresAt: info.expiresAt.toISOString(),
          scope: info.scope,
          operationsUsed: info.operationsUsed,
          createdAt: info.createdAt.toISOString(),
        },
        { self: '/api/v1/session' },
      );
    } catch (error) {
      handleError(res, error, url.pathname);
    }
  });

  return router;
}

function extractBearerToken(headers: Record<string, string | string[] | undefined>): string | null {
  const authHeader = headers.authorization;
  const auth = Array.isArray(authHeader) ? authHeader[0] : authHeader;
  if (!auth?.startsWith('Bearer ')) {
    return null;
  }
  return auth.slice(7);
}

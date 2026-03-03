import { ErrorCodes, TelagentError } from '@telagent/protocol';

import { Router } from '../router.js';
import { created, ok } from '../response.js';
import { handleError } from '../route-utils.js';
import type { RuntimeContext } from '../types.js';

export function federationRoutes(ctx: RuntimeContext): Router {
  const router = new Router();

  router.post('/envelopes', ({ req, res, body, url }) => {
    try {
      if (!body || typeof body !== 'object') {
        throw new TelagentError(ErrorCodes.VALIDATION, 'Envelope payload must be an object');
      }
      const payload = body as Record<string, unknown>;
      const result = ctx.federationService.receiveEnvelope(payload, {
        sourceDomain: resolveSourceDomain(req, payload),
        authToken: resolveFederationToken(req),
      });
      created(res, result, { self: '/api/v1/federation/envelopes' });
    } catch (error) {
      handleError(res, error, url.pathname);
    }
  });

  router.post('/group-state/sync', ({ req, res, body, url }) => {
    try {
      if (!body || typeof body !== 'object') {
        throw new TelagentError(ErrorCodes.VALIDATION, 'group-state payload must be an object');
      }
      const payload = body as Record<string, unknown>;
      const groupId = payload.groupId;
      const state = payload.state;
      if (typeof groupId !== 'string' || typeof state !== 'string') {
        throw new TelagentError(ErrorCodes.VALIDATION, 'groupId and state are required string fields');
      }
      const groupDomain = payload.groupDomain;
      if (typeof groupDomain !== 'undefined' && typeof groupDomain !== 'string') {
        throw new TelagentError(ErrorCodes.VALIDATION, 'groupDomain must be a string when provided');
      }
      const result = ctx.federationService.syncGroupState(
        { groupId, state, groupDomain: typeof groupDomain === 'string' ? groupDomain : undefined },
        {
          sourceDomain: resolveSourceDomain(req, payload),
          authToken: resolveFederationToken(req),
        },
      );
      created(res, result, { self: '/api/v1/federation/group-state/sync' });
    } catch (error) {
      handleError(res, error, url.pathname);
    }
  });

  router.post('/receipts', ({ req, res, body, url }) => {
    try {
      if (!body || typeof body !== 'object') {
        throw new TelagentError(ErrorCodes.VALIDATION, 'receipt payload must be an object');
      }
      const payload = body as Record<string, unknown>;
      const envelopeId = payload.envelopeId;
      const status = payload.status;
      if (typeof envelopeId !== 'string' || (status !== 'delivered' && status !== 'read')) {
        throw new TelagentError(ErrorCodes.VALIDATION, 'envelopeId and status(delivered|read) are required');
      }
      const result = ctx.federationService.recordReceipt(
        { envelopeId, status },
        {
          sourceDomain: resolveSourceDomain(req, payload),
          authToken: resolveFederationToken(req),
        },
      );
      created(res, result, { self: '/api/v1/federation/receipts' });
    } catch (error) {
      handleError(res, error, url.pathname);
    }
  });

  router.get('/node-info', ({ res, url }) => {
    try {
      const info = ctx.federationService.nodeInfo();
      ok(res, info, { self: '/api/v1/federation/node-info' });
    } catch (error) {
      handleError(res, error, url.pathname);
    }
  });

  return router;
}

function resolveFederationToken(req: { headers: Record<string, string | string[] | undefined> }): string | undefined {
  const directToken = headerString(req.headers['x-telagent-federation-token']);
  if (directToken) {
    return directToken;
  }

  const authorization = headerString(req.headers.authorization);
  if (!authorization) {
    return undefined;
  }
  if (authorization.toLowerCase().startsWith('bearer ')) {
    return authorization.slice(7).trim();
  }
  return authorization.trim();
}

function resolveSourceDomain(
  req: { headers: Record<string, string | string[] | undefined> },
  payload: Record<string, unknown>,
): string {
  const headerDomain = headerString(req.headers['x-telagent-source-domain']);
  if (headerDomain) {
    return headerDomain;
  }

  const bodyDomain = payload.sourceDomain;
  if (typeof bodyDomain === 'string' && bodyDomain.trim()) {
    return bodyDomain;
  }
  throw new TelagentError(ErrorCodes.VALIDATION, 'sourceDomain is required');
}

function headerString(value: string | string[] | undefined): string | undefined {
  if (typeof value === 'string') {
    return value.trim() || undefined;
  }
  if (Array.isArray(value) && value.length > 0) {
    const joined = value.join(',').trim();
    return joined || undefined;
  }
  return undefined;
}

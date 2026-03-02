import { ErrorCodes, TelagentError } from '@telagent/protocol';

import { Router } from '../router.js';
import { created, ok } from '../response.js';
import { handleError } from '../route-utils.js';
import type { RuntimeContext } from '../types.js';

export function federationRoutes(ctx: RuntimeContext): Router {
  const router = new Router();

  router.post('/envelopes', ({ res, body, url }) => {
    try {
      if (!body || typeof body !== 'object') {
        throw new TelagentError(ErrorCodes.VALIDATION, 'Envelope payload must be an object');
      }
      const result = ctx.federationService.receiveEnvelope(body as Record<string, unknown>);
      created(res, result, { self: '/api/v1/federation/envelopes' });
    } catch (error) {
      handleError(res, error, url.pathname);
    }
  });

  router.post('/group-state/sync', ({ res, body, url }) => {
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
      const result = ctx.federationService.syncGroupState({ groupId, state });
      created(res, result, { self: '/api/v1/federation/group-state/sync' });
    } catch (error) {
      handleError(res, error, url.pathname);
    }
  });

  router.post('/receipts', ({ res, body, url }) => {
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
      const result = ctx.federationService.recordReceipt({ envelopeId, status });
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

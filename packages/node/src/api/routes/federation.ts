import { ErrorCodes, TelagentError } from '@telagent/protocol';

import { Router } from '../router.js';
import { created, ok, paginated, parsePagination } from '../response.js';
import { handleError } from '../route-utils.js';
import type { RuntimeContext } from '../types.js';

export function federationRoutes(ctx: RuntimeContext): Router {
  const router = new Router();

  router.post('/envelopes', ({ req, res, body, url }) => {
    let payloadForDlq: Record<string, unknown> = {};
    let metaForDlq: {
      sourceDomain?: string;
      protocolVersion?: string;
      sourceKeyId?: string;
    } | undefined;
    try {
      if (!body || typeof body !== 'object') {
        throw new TelagentError(ErrorCodes.VALIDATION, 'Envelope payload must be an object');
      }
      const payload = body as Record<string, unknown>;
      payloadForDlq = payload;
      const meta = {
        sourceDomain: resolveSourceDomain(req, payload),
        authToken: resolveFederationToken(req),
        protocolVersion: resolveProtocolVersion(req, payload),
        sourceKeyId: resolveSourceKeyId(req, payload),
      };
      metaForDlq = {
        sourceDomain: meta.sourceDomain,
        protocolVersion: meta.protocolVersion,
        sourceKeyId: meta.sourceKeyId,
      };
      const result = ctx.federationService.receiveEnvelope(payload, meta);
      created(res, result, { self: '/api/v1/federation/envelopes' });
    } catch (error) {
      captureDlqFailure(ctx, 'envelopes', payloadForDlq, metaForDlq, error);
      handleError(res, error, url.pathname);
    }
  });

  router.post('/group-state/sync', ({ req, res, body, url }) => {
    let payloadForDlq: Record<string, unknown> = {};
    let metaForDlq: {
      sourceDomain?: string;
      protocolVersion?: string;
      sourceKeyId?: string;
    } | undefined;
    try {
      if (!body || typeof body !== 'object') {
        throw new TelagentError(ErrorCodes.VALIDATION, 'group-state payload must be an object');
      }
      const payload = body as Record<string, unknown>;
      payloadForDlq = payload;
      const groupId = payload.groupId;
      const state = payload.state;
      if (typeof groupId !== 'string' || typeof state !== 'string') {
        throw new TelagentError(ErrorCodes.VALIDATION, 'groupId and state are required string fields');
      }
      const groupDomain = payload.groupDomain;
      if (typeof groupDomain !== 'undefined' && typeof groupDomain !== 'string') {
        throw new TelagentError(ErrorCodes.VALIDATION, 'groupDomain must be a string when provided');
      }
      const stateVersion = payload.stateVersion;
      if (typeof stateVersion !== 'undefined' && typeof stateVersion !== 'number') {
        throw new TelagentError(ErrorCodes.VALIDATION, 'stateVersion must be a number when provided');
      }
      const meta = {
        sourceDomain: resolveSourceDomain(req, payload),
        authToken: resolveFederationToken(req),
        protocolVersion: resolveProtocolVersion(req, payload),
        sourceKeyId: resolveSourceKeyId(req, payload),
      };
      metaForDlq = {
        sourceDomain: meta.sourceDomain,
        protocolVersion: meta.protocolVersion,
        sourceKeyId: meta.sourceKeyId,
      };
      const result = ctx.federationService.syncGroupState(
        {
          groupId,
          state,
          groupDomain: typeof groupDomain === 'string' ? groupDomain : undefined,
          stateVersion: typeof stateVersion === 'number' ? stateVersion : undefined,
        },
        meta,
      );
      created(res, result, { self: '/api/v1/federation/group-state/sync' });
    } catch (error) {
      captureDlqFailure(ctx, 'group-state-sync', payloadForDlq, metaForDlq, error);
      handleError(res, error, url.pathname);
    }
  });

  router.post('/receipts', ({ req, res, body, url }) => {
    let payloadForDlq: Record<string, unknown> = {};
    let metaForDlq: {
      sourceDomain?: string;
      protocolVersion?: string;
      sourceKeyId?: string;
    } | undefined;
    try {
      if (!body || typeof body !== 'object') {
        throw new TelagentError(ErrorCodes.VALIDATION, 'receipt payload must be an object');
      }
      const payload = body as Record<string, unknown>;
      payloadForDlq = payload;
      const envelopeId = payload.envelopeId;
      const status = payload.status;
      if (typeof envelopeId !== 'string' || (status !== 'delivered' && status !== 'read')) {
        throw new TelagentError(ErrorCodes.VALIDATION, 'envelopeId and status(delivered|read) are required');
      }
      const meta = {
        sourceDomain: resolveSourceDomain(req, payload),
        authToken: resolveFederationToken(req),
        protocolVersion: resolveProtocolVersion(req, payload),
        sourceKeyId: resolveSourceKeyId(req, payload),
      };
      metaForDlq = {
        sourceDomain: meta.sourceDomain,
        protocolVersion: meta.protocolVersion,
        sourceKeyId: meta.sourceKeyId,
      };
      const result = ctx.federationService.recordReceipt(
        { envelopeId, status },
        meta,
      );
      created(res, result, { self: '/api/v1/federation/receipts' });
    } catch (error) {
      captureDlqFailure(ctx, 'receipts', payloadForDlq, metaForDlq, error);
      handleError(res, error, url.pathname);
    }
  });

  router.get('/dlq', ({ res, query, url }) => {
    try {
      const status = parseDlqStatus(query.get('status'));
      const statusQueryValue = status === 'ALL' ? 'all' : status.toLowerCase();
      const { page, perPage, offset } = parsePagination(query);
      const entries = ctx.federationService.listDlqEntries({ status });
      const pageEntries = entries.slice(offset, offset + perPage);
      paginated(res, pageEntries, {
        page,
        perPage,
        total: entries.length,
        basePath: '/api/v1/federation/dlq',
        query: { status: statusQueryValue },
      });
    } catch (error) {
      handleError(res, error, url.pathname);
    }
  });

  router.post('/dlq/replay', ({ res, body, url }) => {
    try {
      if (typeof body !== 'undefined' && (!body || typeof body !== 'object')) {
        throw new TelagentError(ErrorCodes.VALIDATION, 'dlq replay payload must be an object');
      }
      const payload = (body || {}) as Record<string, unknown>;
      const replayInput = parseDlqReplayInput(payload);
      const report = ctx.federationService.replayDlq(replayInput);
      ok(res, report, { self: '/api/v1/federation/dlq/replay' });
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

function captureDlqFailure(
  ctx: RuntimeContext,
  scope: 'envelopes' | 'group-state-sync' | 'receipts',
  payload: Record<string, unknown>,
  meta: {
    sourceDomain?: string;
    protocolVersion?: string;
    sourceKeyId?: string;
  } | undefined,
  error: unknown,
): void {
  try {
    const safePayload = payload && typeof payload === 'object' ? payload : {};
    ctx.federationService.recordDlqFailure(scope, safePayload, meta, error);
  } catch {
    // preserve original route error path, dlq capture is best effort
  }
}

function parseDlqStatus(raw: string | null): 'PENDING' | 'REPLAYED' | 'ALL' {
  const normalized = (raw || 'pending').trim().toLowerCase();
  if (normalized === 'pending') {
    return 'PENDING';
  }
  if (normalized === 'replayed') {
    return 'REPLAYED';
  }
  if (normalized === 'all') {
    return 'ALL';
  }
  throw new TelagentError(ErrorCodes.VALIDATION, 'dlq status must be one of pending|replayed|all');
}

function parseDlqReplayInput(payload: Record<string, unknown>): {
  ids?: string[];
  maxItems?: number;
  stopOnError?: boolean;
} {
  const idsRaw = payload.ids;
  let ids: string[] | undefined;
  if (typeof idsRaw !== 'undefined') {
    if (!Array.isArray(idsRaw)) {
      throw new TelagentError(ErrorCodes.VALIDATION, 'ids must be an array of strings when provided');
    }
    const parsedIds = idsRaw
      .map((item) => (typeof item === 'string' ? item.trim() : ''))
      .filter(Boolean);
    if (parsedIds.length === 0) {
      throw new TelagentError(ErrorCodes.VALIDATION, 'ids array must contain at least one non-empty string');
    }
    ids = parsedIds;
  }

  const maxItemsRaw = payload.maxItems;
  let maxItems: number | undefined;
  if (typeof maxItemsRaw !== 'undefined') {
    if (typeof maxItemsRaw !== 'number' || !Number.isInteger(maxItemsRaw) || maxItemsRaw <= 0) {
      throw new TelagentError(ErrorCodes.VALIDATION, 'maxItems must be a positive integer when provided');
    }
    maxItems = maxItemsRaw;
  }

  const stopOnErrorRaw = payload.stopOnError;
  let stopOnError: boolean | undefined;
  if (typeof stopOnErrorRaw !== 'undefined') {
    if (typeof stopOnErrorRaw !== 'boolean') {
      throw new TelagentError(ErrorCodes.VALIDATION, 'stopOnError must be boolean when provided');
    }
    stopOnError = stopOnErrorRaw;
  }

  return {
    ids,
    maxItems,
    stopOnError,
  };
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

function resolveProtocolVersion(
  req: { headers: Record<string, string | string[] | undefined> },
  payload: Record<string, unknown>,
): string | undefined {
  const headerVersion = headerString(req.headers['x-telagent-protocol-version']);
  if (headerVersion) {
    return headerVersion;
  }

  const bodyVersion = payload.protocolVersion;
  if (typeof bodyVersion === 'string' && bodyVersion.trim()) {
    return bodyVersion;
  }
  return undefined;
}

function resolveSourceKeyId(
  req: { headers: Record<string, string | string[] | undefined> },
  payload: Record<string, unknown>,
): string | undefined {
  const headerKeyId = headerString(req.headers['x-telagent-source-key-id']);
  if (headerKeyId) {
    return headerKeyId;
  }

  const bodyKeyId = payload.sourceKeyId;
  if (typeof bodyKeyId === 'string' && bodyKeyId.trim()) {
    return bodyKeyId;
  }
  return undefined;
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

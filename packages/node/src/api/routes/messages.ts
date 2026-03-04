import { ErrorCodes, SendMessageSchema, TelagentError } from '@telagent/protocol';

import { Router } from '../router.js';
import { created, ok } from '../response.js';
import { handleError } from '../route-utils.js';
import type { RuntimeContext } from '../types.js';
import { validate } from '../validate.js';
import {
  domainBaseUrl,
  normalizeFederationDomain,
  resolveSequencerDomain,
} from '../../services/sequencer-domain.js';

export function messageRoutes(ctx: RuntimeContext): Router {
  const router = new Router();

  router.post('/', async ({ res, body, url }) => {
    const parsed = validate(SendMessageSchema, body);
    if (!parsed.success) {
      handleError(res, new TelagentError(ErrorCodes.VALIDATION, parsed.error), url.pathname);
      return;
    }

    try {
      const federationRuntime = resolveFederationRuntime(ctx);
      const selfDomain = federationRuntime.selfDomain;
      const sequencerDomain = resolveSequencerDomain(parsed.data, {
        selfDomain,
        resolveGroupDomain: (groupId) => ctx.groupService.getGroup(groupId).groupDomain,
      });

      const allowRemoteSequencerSubmit = Boolean(ctx.federationDeliveryService);

      let envelope;
      if (sequencerDomain === selfDomain || !allowRemoteSequencerSubmit) {
        envelope = await ctx.messageService.send(parsed.data);
        if (ctx.federationDeliveryService) {
          await ctx.federationDeliveryService.enqueue(envelope);
        }
      } else {
        const submitted = await submitToSequencer(parsed.data, {
          sequencerDomain,
          sourceDomain: selfDomain,
          protocolVersion: federationRuntime.protocolVersion,
          authToken: federationRuntime.authToken,
        });
        envelope = await ctx.messageService.ingestFederatedEnvelope(submitted);
      }
      created(
        res,
        {
          envelope,
        },
        { self: `/api/v1/messages/pull?conversation_id=${encodeURIComponent(envelope.conversationId)}` },
      );
    } catch (error) {
      handleError(res, error, url.pathname);
    }
  });

  router.get('/pull', async ({ res, query, url }) => {
    try {
      const result = await ctx.messageService.pull({
        cursor: query.get('cursor') ?? undefined,
        limit: query.get('limit') ? Number.parseInt(query.get('limit') ?? '', 10) : undefined,
        conversationId: query.get('conversation_id') ?? undefined,
      });

      ok(
        res,
        {
          items: result.items,
          cursor: result.nextCursor,
        },
        { self: '/api/v1/messages/pull' },
      );
    } catch (error) {
      handleError(res, error, url.pathname);
    }
  });

  router.get('/retracted', async ({ res, query, url }) => {
    try {
      const limit = parsePositiveInt(query.get('limit'), 'limit') ?? 50;
      const conversationId = query.get('conversation_id') ?? undefined;
      const all = await ctx.messageService.listRetracted(limit);
      const items = conversationId
        ? all.filter((entry) => entry.conversationId === conversationId)
        : all;

      const selfQuery = new URLSearchParams();
      selfQuery.set('limit', String(limit));
      if (conversationId) {
        selfQuery.set('conversation_id', conversationId);
      }

      ok(
        res,
        {
          items,
        },
        { self: `/api/v1/messages/retracted?${selfQuery.toString()}` },
      );
    } catch (error) {
      handleError(res, error, url.pathname);
    }
  });

  return router;
}

interface FederationRuntime {
  selfDomain: string;
  protocolVersion: string;
  authToken?: string;
}

function resolveFederationRuntime(ctx: RuntimeContext): FederationRuntime {
  const gateway = ctx.federationService as unknown as {
    getSelfDomain?: () => string;
    getProtocolVersion?: () => string;
    getAuthToken?: () => string | undefined;
    nodeInfo?: () => { domain: string; protocolVersion?: string };
  };

  const nodeInfo = gateway.nodeInfo?.();
  const selfDomain = normalizeFederationDomain(
    gateway.getSelfDomain?.() ?? nodeInfo?.domain ?? 'localhost',
    'selfDomain',
  );
  const protocolVersion = gateway.getProtocolVersion?.() ?? nodeInfo?.protocolVersion ?? 'v1';
  const authToken = gateway.getAuthToken?.();

  return { selfDomain, protocolVersion, authToken };
}

async function submitToSequencer(
  payload: Record<string, unknown>,
  opts: {
    sequencerDomain: string;
    sourceDomain: string;
    protocolVersion: string;
    authToken?: string;
  },
): Promise<Record<string, unknown>> {
  const endpoint = `${domainBaseUrl(opts.sequencerDomain)}/api/v1/federation/messages/submit`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-telagent-source-domain': opts.sourceDomain,
      'x-telagent-protocol-version': opts.protocolVersion,
      ...(opts.authToken ? { 'x-telagent-federation-token': opts.authToken } : {}),
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(10_000),
  });

  const body = await parseJsonSafely(response);
  if (!response.ok) {
    const detail = typeof body?.detail === 'string' ? body.detail : `Sequencer ${opts.sequencerDomain} rejected request`;
    throw new TelagentError(ErrorCodes.CONFLICT, detail);
  }

  const envelope = body?.data && typeof body.data === 'object'
    ? (body.data as Record<string, unknown>).envelope
    : undefined;
  if (!envelope || typeof envelope !== 'object') {
    throw new TelagentError(ErrorCodes.CONFLICT, 'Sequencer response missing data.envelope');
  }
  return envelope as Record<string, unknown>;
}

async function parseJsonSafely(response: Response): Promise<Record<string, unknown> | undefined> {
  try {
    return (await response.json()) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

function parsePositiveInt(raw: string | null, field: string): number | undefined {
  if (!raw || !raw.trim()) {
    return undefined;
  }
  const value = Number.parseInt(raw, 10);
  if (!Number.isInteger(value) || value <= 0) {
    throw new TelagentError(ErrorCodes.VALIDATION, `${field} must be a positive integer`);
  }
  return value;
}

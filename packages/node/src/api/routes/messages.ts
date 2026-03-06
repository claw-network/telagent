import { ErrorCodes, SendMessageSchema, TelagentError } from '@telagent/protocol';

import { Router } from '../router.js';
import { created, ok } from '../response.js';
import { handleError } from '../route-utils.js';
import type { RuntimeContext } from '../types.js';
import { validate } from '../validate.js';

export function messageRoutes(ctx: RuntimeContext): Router {
  const router = new Router();

  router.post('/', async ({ res, body, url }) => {
    const parsed = validate(SendMessageSchema, body);
    if (!parsed.success) {
      handleError(res, new TelagentError(ErrorCodes.VALIDATION, parsed.error), url.pathname);
      return;
    }

    try {
      const envelope = await ctx.messageService.send(parsed.data);

      if (ctx.clawnetTransportService && ctx.config.transportMode !== 'http-only') {
        const { targetDid } = parsed.data;
        if (targetDid) {
          await ctx.clawnetTransportService.sendEnvelope(targetDid, envelope);
        }
      }

      created(
        res,
        { envelope },
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

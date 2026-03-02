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
      const envelope = ctx.messageService.send(parsed.data);
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

  router.get('/pull', ({ res, query, url }) => {
    try {
      const result = ctx.messageService.pull({
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

  return router;
}

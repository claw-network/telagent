import { ErrorCodes, TelagentError } from '@telagent/protocol';

import { Router } from '../router.js';
import { handleError } from '../route-utils.js';
import { ok, paginated, parsePagination } from '../response.js';
import type { RuntimeContext } from '../types.js';

export function conversationRoutes(ctx: RuntimeContext): Router {
  const router = new Router();

  router.get('/', async ({ res, query, url }) => {
    try {
      const { page, perPage, offset } = parsePagination(query);
      const sort = (query.get('sort') ?? 'last_message').trim() || 'last_message';
      const all = await ctx.messageService.listConversations();
      const normalized = all.map((item) => ({ ...item }));

      normalized.sort((left, right) => (right.lastMessageAtMs ?? 0) - (left.lastMessageAtMs ?? 0));

      const data = normalized.slice(offset, offset + perPage);
      const queryHints = sort !== 'last_message'
        ? { sort }
        : undefined;

      paginated(res, data, {
        page,
        perPage,
        total: normalized.length,
        basePath: '/api/v1/conversations',
        query: queryHints,
      });
    } catch (error) {
      handleError(res, error, url.pathname);
    }
  });

  router.put('/:conversationId/privacy', async ({ req, res, params, body, url }) => {
    try {
      // Auth handled by global middleware; any valid session may adjust privacy.
      if (!body || typeof body !== 'object' || Array.isArray(body)) {
        throw new TelagentError(ErrorCodes.VALIDATION, 'body must be an object');
      }

      const privateValue = (body as Record<string, unknown>).private;
      if (typeof privateValue !== 'boolean') {
        throw new TelagentError(ErrorCodes.VALIDATION, 'private must be a boolean');
      }

      const result = await ctx.messageService.setConversationPrivacy(
        params.conversationId,
        privateValue,
      );
      ok(
        res,
        result,
        {
          self: `/api/v1/conversations/${encodeURIComponent(params.conversationId)}/privacy`,
        },
      );
    } catch (error) {
      handleError(res, error, url.pathname);
    }
  });

  return router;
}

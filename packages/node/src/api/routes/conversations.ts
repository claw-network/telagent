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
      assertAgentCaller(req.headers, ctx);
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

function assertAgentCaller(
  headers: Record<string, string | string[] | undefined>,
  ctx: RuntimeContext,
): void {
  const token = extractBearerToken(headers);
  if (!token) {
    throw new TelagentError(
      ErrorCodes.UNAUTHORIZED,
      'Missing Authorization header. Use: Bearer tses_xxx',
    );
  }

  if (token.startsWith('owner_') || token.startsWith('owner:')) {
    throw new TelagentError(
      ErrorCodes.FORBIDDEN,
      'Owner token is not allowed to mutate conversation privacy',
    );
  }

  if (!token.startsWith('tses_')) {
    throw new TelagentError(
      ErrorCodes.UNAUTHORIZED,
      'Invalid agent token format. Use: Bearer tses_xxx',
    );
  }

  const session = ctx.sessionManager.getSessionInfo(token);
  if (!session?.active) {
    throw new TelagentError(
      ErrorCodes.UNAUTHORIZED,
      'Session token is expired or invalid. Unlock a new session first.',
    );
  }
}

function extractBearerToken(headers: Record<string, string | string[] | undefined>): string | null {
  const authHeader = headers.authorization;
  const auth = Array.isArray(authHeader) ? authHeader[0] : authHeader;
  if (!auth || typeof auth !== 'string') {
    return null;
  }
  const normalized = auth.trim();
  if (!normalized.toLowerCase().startsWith('bearer ')) {
    return null;
  }
  const token = normalized.slice(7).trim();
  return token || null;
}

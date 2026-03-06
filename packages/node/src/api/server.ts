import { createServer, type IncomingMessage, type Server } from 'node:http';
import { performance } from 'node:perf_hooks';

import { ErrorCodes, TelagentError } from '@telagent/protocol';

import { extractBearerToken } from './auth.js';
import { Router } from './router.js';
import { problem } from './response.js';
import { attachmentRoutes } from './routes/attachments.js';
import { groupRoutes } from './routes/groups.js';
import { identityRoutes } from './routes/identities.js';
import { keyRoutes } from './routes/keys.js';
import { messageRoutes } from './routes/messages.js';
import { nodeRoutes } from './routes/node.js';
import { conversationRoutes } from './routes/conversations.js';
import { ownerRoutes } from './routes/owner.js';
import { clawnetRoutes } from './routes/clawnet.js';
import { sessionRoutes } from './routes/session.js';
import { walletRoutes } from './routes/wallets.js';
import type { RuntimeContext } from './types.js';

function buildRouter(ctx: RuntimeContext): Router {
  const router = new Router();

  router.mount('/api/v1/node', nodeRoutes(ctx));
  router.mount('/api/v1/identities', identityRoutes(ctx));
  router.mount('/api/v1/groups', groupRoutes(ctx));
  router.mount('/api/v1/keys', keyRoutes(ctx));
  router.mount('/api/v1/wallets', walletRoutes(ctx));
  router.mount('/api/v1/messages', messageRoutes(ctx));
  router.mount('/api/v1/conversations', conversationRoutes(ctx));
  router.mount('/api/v1/owner', ownerRoutes(ctx));
  router.mount('/api/v1/attachments', attachmentRoutes(ctx));
  router.mount('/api/v1/session', sessionRoutes(ctx));
  router.mount('/api/v1/clawnet', clawnetRoutes(ctx));

  return router;
}

/**
 * Global auth gate — runs before route dispatch.
 * Whitelisted paths are allowed without a session token.
 * Everything else requires a valid tses_* session.
 */
const AUTH_WHITELIST: Array<{ method?: string; path: string }> = [
  { method: 'POST', path: '/api/v1/session/unlock' },
  { path: '/api/v1/node' },
  { path: '/api/v1/identities/self' },
];

function isAuthExempt(method: string, pathname: string): boolean {
  for (const rule of AUTH_WHITELIST) {
    if (rule.method && rule.method !== method) continue;
    if (pathname === rule.path || pathname.startsWith(rule.path + '/')) return true;
  }
  return false;
}

function requireGlobalAuth(req: IncomingMessage, pathname: string, ctx: RuntimeContext): void {
  const method = req.method || 'GET';
  if (method === 'OPTIONS') return;
  if (!pathname.startsWith('/api/v1/')) return; // only enforce on API routes
  if (isAuthExempt(method, pathname)) return;

  const token = extractBearerToken(req.headers as Record<string, string | string[] | undefined>);
  if (!token) {
    throw new TelagentError(ErrorCodes.UNAUTHORIZED, 'Authentication required');
  }
  if (!token.startsWith('tses_')) {
    throw new TelagentError(ErrorCodes.UNAUTHORIZED, 'Invalid token format. Expected session token (tses_*).');
  }
  const info = ctx.sessionManager.getSessionInfo(token);
  if (!info || !info.active) {
    throw new TelagentError(ErrorCodes.UNAUTHORIZED, 'Session expired or invalid');
  }
}

export class ApiServer {
  private server: Server | null = null;
  private readonly router: Router;

  constructor(private readonly ctx: RuntimeContext) {
    this.router = buildRouter(ctx);
  }

  async start(): Promise<void> {
    if (this.server) {
      return;
    }

    this.server = createServer(async (req, res) => {
      const parsedUrl = new URL(req.url || '/', 'http://127.0.0.1');
      const startedAt = performance.now();
      res.once('finish', () => {
        this.ctx.monitoringService.recordHttpRequest({
          method: req.method || 'UNKNOWN',
          path: parsedUrl.pathname,
          status: res.statusCode,
          durationMs: performance.now() - startedAt,
        });
      });

      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');

      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }

      try {
        requireGlobalAuth(req, parsedUrl.pathname, this.ctx);
      } catch (error) {
        const authErr = error instanceof TelagentError ? error : new TelagentError(ErrorCodes.UNAUTHORIZED, 'Authentication required');
        problem(res, authErr.toProblem(req.url));
        return;
      }

      try {
        const matched = await this.router.handle(req, res);
        if (!matched && !res.headersSent) {
          const notFound = new TelagentError(ErrorCodes.NOT_FOUND, 'Route not found');
          problem(res, notFound.toProblem(req.url));
        }
      } catch (error) {
        if (res.headersSent) {
          return;
        }
        const internal = error instanceof TelagentError ? error : new TelagentError(ErrorCodes.INTERNAL, error instanceof Error ? error.message : 'Unexpected error');
        problem(res, internal.toProblem(req.url));
      }
    });

    await new Promise<void>((resolve) => {
      this.server!.listen(this.ctx.config.port, this.ctx.config.host, resolve);
    });
  }

  async stop(): Promise<void> {
    if (!this.server) {
      return;
    }
    const current = this.server;
    this.server = null;
    await new Promise<void>((resolve) => {
      current.close(() => resolve());
    });
  }

  get httpServer(): Server | null {
    return this.server;
  }
}

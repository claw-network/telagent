import { createServer, type Server } from 'node:http';
import { performance } from 'node:perf_hooks';

import { ErrorCodes, TelagentError } from '@telagent/protocol';

import { Router } from './router.js';
import { problem } from './response.js';
import { attachmentRoutes } from './routes/attachments.js';
import { federationRoutes } from './routes/federation.js';
import { groupRoutes } from './routes/groups.js';
import { identityRoutes } from './routes/identities.js';
import { messageRoutes } from './routes/messages.js';
import { nodeRoutes } from './routes/node.js';
import { walletRoutes } from './routes/wallets.js';
import type { RuntimeContext } from './types.js';

function buildRouter(ctx: RuntimeContext): Router {
  const router = new Router();

  router.mount('/api/v1/node', nodeRoutes(ctx));
  router.mount('/api/v1/identities', identityRoutes(ctx));
  router.mount('/api/v1/groups', groupRoutes(ctx));
  router.mount('/api/v1/wallets', walletRoutes(ctx));
  router.mount('/api/v1/messages', messageRoutes(ctx));
  router.mount('/api/v1/attachments', attachmentRoutes(ctx));
  router.mount('/api/v1/federation', federationRoutes(ctx));

  return router;
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
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');

      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
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

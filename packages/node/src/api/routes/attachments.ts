import {
  CompleteAttachmentSchema,
  ErrorCodes,
  InitAttachmentSchema,
  TelagentError,
} from '@telagent/protocol';

import { Router } from '../router.js';
import { created, ok } from '../response.js';
import { handleError } from '../route-utils.js';
import { getGlobalLogger } from '../../logger.js';
import type { ApiServerConfig, RuntimeContext } from '../types.js';
import { validate } from '../validate.js';

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '0.0.0.0', '']);

function nodeBaseUrl(config: ApiServerConfig): string {
  if (config.publicUrl) return config.publicUrl.replace(/\/$/, '');
  if (LOOPBACK_HOSTS.has(config.host)) {
    getGlobalLogger().warn(
      '[attachments] Node is bound to a loopback address (%s) and TELAGENT_PUBLIC_URL is not set. ' +
      'Attachment download URLs will use this loopback address and will NOT be reachable by ' +
      'other nodes. Set TELAGENT_PUBLIC_URL to the publicly-reachable URL of this node to fix this.',
      config.host,
    );
  }
  return `http://${config.host}:${config.port}`;
}

export function attachmentRoutes(ctx: RuntimeContext): Router {
  const router = new Router();

  router.post('/init-upload', ({ res, body, url }) => {
    const parsed = validate(InitAttachmentSchema, body);
    if (!parsed.success) {
      handleError(res, new TelagentError(ErrorCodes.VALIDATION, parsed.error), url.pathname);
      return;
    }

    try {
      const result = ctx.attachmentService.initUpload(parsed.data);
      const uploadUrl = `${nodeBaseUrl(ctx.config)}/api/v1/attachments/${encodeURIComponent(result.objectKey)}`;
      created(res, { ...result, uploadUrl }, { self: `/api/v1/attachments/${encodeURIComponent(result.objectKey)}` });
    } catch (error) {
      handleError(res, error, url.pathname);
    }
  });

  router.post('/complete-upload', async ({ res, body, url }) => {
    const parsed = validate(CompleteAttachmentSchema, body);
    if (!parsed.success) {
      handleError(res, new TelagentError(ErrorCodes.VALIDATION, parsed.error), url.pathname);
      return;
    }

    try {
      const result = ctx.attachmentService.completeUpload({
        objectKey: parsed.data.objectKey,
        manifestHash: parsed.data.manifestHash,
        checksum: parsed.data.checksum,
        fileContentType: parsed.data.fileContentType,
      });

      // If the client included inline base64 file data, decode and save it now.
      if (parsed.data.fileData) {
        const fileBuffer = Buffer.from(parsed.data.fileData, 'base64');
        await ctx.attachmentService.saveFile(result.objectKey, fileBuffer);
      }

      const downloadUrl = `${nodeBaseUrl(ctx.config)}/api/v1/attachments/${encodeURIComponent(result.objectKey)}`;
      ok(res, { ...result, downloadUrl }, { self: `/api/v1/attachments/${encodeURIComponent(result.objectKey)}` });
    } catch (error) {
      handleError(res, error, url.pathname);
    }
  });

  // Receive uploaded file bytes
  router.put('/:objectKey', async ({ res, body, params, url }) => {
    try {
      if (!Buffer.isBuffer(body)) {
        handleError(res, new TelagentError(ErrorCodes.VALIDATION, 'Expected binary body'), url.pathname);
        return;
      }
      await ctx.attachmentService.saveFile(params.objectKey!, body);
      res.writeHead(204);
      res.end();
    } catch (error) {
      handleError(res, error, url.pathname);
    }
  });

  // Serve stored file
  router.get('/:objectKey', async ({ res, params, url }) => {
    try {
      const data = await ctx.attachmentService.readFile(params.objectKey!);
      if (!data) {
        handleError(res, new TelagentError(ErrorCodes.NOT_FOUND, 'Attachment not found'), url.pathname);
        return;
      }
      const contentType = ctx.attachmentService.getContentType(params.objectKey!);
      res.writeHead(200, {
        'Content-Type': contentType,
        'Content-Length': data.length,
        'Cache-Control': 'private, max-age=86400',
      });
      res.end(data);
    } catch (error) {
      handleError(res, error, url.pathname);
    }
  });

  return router;
}

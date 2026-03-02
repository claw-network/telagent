import {
  CompleteAttachmentSchema,
  ErrorCodes,
  InitAttachmentSchema,
  TelagentError,
} from '@telagent/protocol';

import { Router } from '../router.js';
import { created, ok } from '../response.js';
import { handleError } from '../route-utils.js';
import type { RuntimeContext } from '../types.js';
import { validate } from '../validate.js';

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
      created(res, result, { self: `/api/v1/attachments/${encodeURIComponent(result.objectKey)}` });
    } catch (error) {
      handleError(res, error, url.pathname);
    }
  });

  router.post('/complete-upload', ({ res, body, url }) => {
    const parsed = validate(CompleteAttachmentSchema, body);
    if (!parsed.success) {
      handleError(res, new TelagentError(ErrorCodes.VALIDATION, parsed.error), url.pathname);
      return;
    }

    try {
      const result = ctx.attachmentService.completeUpload(parsed.data);
      ok(res, result, { self: `/api/v1/attachments/${encodeURIComponent(result.objectKey)}` });
    } catch (error) {
      handleError(res, error, url.pathname);
    }
  });

  return router;
}

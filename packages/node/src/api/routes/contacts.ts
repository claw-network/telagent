import { ErrorCodes, TelagentError } from '@telagent/protocol';

import { Router } from '../router.js';
import { handleError } from '../route-utils.js';
import { ok, created, noContent } from '../response.js';
import type { RuntimeContext } from '../types.js';

export function contactRoutes(ctx: RuntimeContext): Router {
  const router = new Router();

  router.get('/', async ({ res, url }) => {
    try {
      const contacts = ctx.contactService.listContacts();
      ok(res, contacts, { self: '/api/v1/contacts' });
    } catch (error) {
      handleError(res, error, url.pathname);
    }
  });

  router.get('/:did', async ({ res, params, url }) => {
    try {
      const contact = ctx.contactService.getContact(params.did);
      if (!contact) {
        throw new TelagentError(ErrorCodes.NOT_FOUND, `Contact not found: ${params.did}`);
      }
      ok(res, contact, { self: `/api/v1/contacts/${encodeURIComponent(params.did)}` });
    } catch (error) {
      handleError(res, error, url.pathname);
    }
  });

  router.post('/', async ({ res, body, url }) => {
    try {
      if (!body || typeof body !== 'object' || Array.isArray(body)) {
        throw new TelagentError(ErrorCodes.VALIDATION, 'body must be an object');
      }
      const payload = body as Record<string, unknown>;
      const did = typeof payload.did === 'string' ? payload.did.trim() : '';
      const displayName = typeof payload.displayName === 'string' ? payload.displayName.trim() : '';
      if (!did) {
        throw new TelagentError(ErrorCodes.VALIDATION, 'did is required');
      }
      if (!displayName) {
        throw new TelagentError(ErrorCodes.VALIDATION, 'displayName is required');
      }

      const contact = ctx.contactService.addContact({
        did,
        displayName,
        avatarUrl: typeof payload.avatarUrl === 'string' ? payload.avatarUrl : undefined,
        notes: typeof payload.notes === 'string' ? payload.notes : undefined,
      });

      // Fire-and-forget: push our profile card to the new contact so they know us,
      // and trigger a reciprocal profile-card reply so we learn their nickname/avatar.
      void (async () => {
        try {
          const profile = await ctx.selfProfileStore.loadPublic();
          if (!profile.nickname) return;
          const selfDid = ctx.identityService.getSelfDid();
          let avatarUrl = profile.avatarUrl;
          if (avatarUrl?.startsWith('/') && ctx.config.publicUrl) {
            avatarUrl = `${ctx.config.publicUrl.replace(/\/$/, '')}${avatarUrl}`;
          }
          await ctx.clawnetTransportService.sendProfileCard(did, {
            did: selfDid,
            nickname: profile.nickname,
            avatarUrl,
            nodeUrl: ctx.config.publicUrl ?? profile.nodeUrl,
          });
        } catch {
          // fire-and-forget
        }
      })();

      created(res, contact, { self: `/api/v1/contacts/${encodeURIComponent(did)}` });
    } catch (error) {
      handleError(res, error, url.pathname);
    }
  });

  router.put('/:did', async ({ res, params, body, url }) => {
    try {
      if (!body || typeof body !== 'object' || Array.isArray(body)) {
        throw new TelagentError(ErrorCodes.VALIDATION, 'body must be an object');
      }
      const payload = body as Record<string, unknown>;
      const contact = ctx.contactService.updateContact(params.did, {
        displayName: typeof payload.displayName === 'string' ? payload.displayName : undefined,
        avatarUrl: typeof payload.avatarUrl === 'string' ? payload.avatarUrl : undefined,
        notes: typeof payload.notes === 'string' ? payload.notes : undefined,
      });
      ok(res, contact, { self: `/api/v1/contacts/${encodeURIComponent(params.did)}` });
    } catch (error) {
      handleError(res, error, url.pathname);
    }
  });

  router.delete('/:did', async ({ res, params, url }) => {
    try {
      ctx.contactService.removeContact(params.did);
      noContent(res);
    } catch (error) {
      handleError(res, error, url.pathname);
    }
  });

  return router;
}

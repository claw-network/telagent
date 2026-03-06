import { ErrorCodes, TelagentError, type InterventionScope } from '@telagent/protocol';

import type { RuntimeContext } from './types.js';

/**
 * Extract the raw bearer token from request headers.
 * Returns null if no valid Bearer token is present.
 */
export function extractBearerToken(headers: Record<string, string | string[] | undefined>): string | null {
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

/**
 * Determine token kind from the raw token string.
 * - 'agent' for tses_* session tokens
 * - 'owner' for generic access tokens used by webapp Owner
 * - null if no token
 */
export type CallerKind = 'agent' | 'owner';

export function classifyToken(token: string | null): CallerKind | null {
  if (!token) return null;
  if (token.startsWith('tses_')) return 'agent';
  return 'owner';
}

/**
 * Guard for write operations.
 *
 * - Agent session tokens (tses_*) are always allowed — the agent is the
 *   principal and needs no scope check.
 * - Owner tokens are checked against OwnerPermissionService:
 *   - If mode is 'observer', ALL write operations are denied.
 *   - If mode is 'intervener', the required scope must be included.
 * - If no token is provided, the request is allowed (unauthenticated local
 *   access, e.g. agent's own process calling its own API).
 */
export function requireWriteAccess(
  headers: Record<string, string | string[] | undefined>,
  ctx: RuntimeContext,
  requiredScope: InterventionScope,
): void {
  const token = extractBearerToken(headers);
  const kind = classifyToken(token);

  // No token or agent session token — always allowed
  if (kind === null || kind === 'agent') {
    return;
  }

  // Owner token — check permissions
  const permissions = ctx.ownerPermissionService;
  if (!permissions) {
    // No permission service configured — deny by default for owner tokens
    throw new TelagentError(
      ErrorCodes.FORBIDDEN,
      'Owner permission service is not configured. Write access denied.',
    );
  }

  if (!permissions.canIntervene(requiredScope)) {
    throw new TelagentError(
      ErrorCodes.FORBIDDEN,
      `Owner does not have '${requiredScope}' permission. Current mode: ${permissions.getPermissions().mode}`,
    );
  }
}

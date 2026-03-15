import type { SelfProfileStore } from '../storage/profile-store.js';
import type { ClawNetTransportService } from '../services/clawnet-transport-service.js';
import type { IdentityAdapterService } from '../services/identity-adapter-service.js';
import { getEffectiveNodeUrl } from './avatar-url.js';

interface ProfileCardContext {
  config: { host: string; port: number; publicUrl?: string };
  selfProfileStore: SelfProfileStore;
  identityService: IdentityAdapterService;
  clawnetTransportService: ClawNetTransportService;
}

/**
 * Push our own profile card to a peer so they learn our nickname/avatar.
 * Silently skips if no nickname is configured.
 * Returns a promise that resolves when the card has been sent (or skipped).
 */
export async function pushOwnProfileCard(ctx: ProfileCardContext, targetDid: string): Promise<void> {
  const profile = await ctx.selfProfileStore.loadPublic();
  if (!profile.nickname) return;

  const selfDid = ctx.identityService.getSelfDid();
  const effectiveNodeUrl = getEffectiveNodeUrl(ctx.config);
  let avatarUrl = profile.avatarUrl;
  if (avatarUrl?.startsWith('/')) {
    avatarUrl = `${effectiveNodeUrl}${avatarUrl}`;
  }

  await ctx.clawnetTransportService.sendProfileCard(targetDid, {
    did: selfDid,
    nickname: profile.nickname,
    avatarUrl,
    nodeUrl: effectiveNodeUrl,
  });
}

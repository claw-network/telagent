export function resolvePeerAvatarUrl(
  avatarUrl: string | undefined,
  peerNodeUrl: string | undefined,
): string | undefined {
  if (!avatarUrl) {
    return undefined;
  }

  if (!avatarUrl.startsWith('/')) {
    return avatarUrl;
  }

  if (!peerNodeUrl) {
    return avatarUrl;
  }

  return `${peerNodeUrl.replace(/\/$/, '')}${avatarUrl}`;
}

/**
 * Returns the local proxy path the frontend should use to load a peer avatar.
 * The local node will proxy the request to the remote peer node, avoiding
 * cross-origin / firewall issues in the browser.
 */
export function localPeerAvatarUrl(did: string, avatarUrl: string | undefined): string | undefined {
  if (!avatarUrl) return undefined;
  return `/api/v1/profile/${encodeURIComponent(did)}/avatar`;
}

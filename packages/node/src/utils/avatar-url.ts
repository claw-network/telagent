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

/**
 * Derive the effective public URL for this node. When `publicUrl` is explicitly
 * configured it takes precedence; otherwise we fall back to `http://host:port`.
 * This ensures profile cards always carry an absolute URL so peers can proxy
 * avatars without requiring every operator to set TELAGENT_PUBLIC_URL.
 */
export function getEffectiveNodeUrl(config: { host: string; port: number; publicUrl?: string }): string {
  if (config.publicUrl) return config.publicUrl.replace(/\/$/, '');
  const host = config.host === '0.0.0.0' || config.host === '::' ? '127.0.0.1' : config.host;
  return `http://${host}:${config.port}`;
}

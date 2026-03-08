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

/**
 * Studio links are signed and carry their own validity window:
 *   s = issued-at (epoch seconds), e = duration in seconds.
 * Other providers (plain .mp4, other CDNs) carry nothing.
 *
 * `linkExpiresAt` returns the EXACT expiry (for display). `isLinkExpired`
 * applies a safety margin so we never hand the player a link that is about to
 * die. When the link declares nothing, both return null/false — never guess.
 */
export const LINK_EXPIRY_MARGIN_SECONDS = 120;

export function linkExpiresAt(sourceUrl: string): number | null {
  try {
    const url = new URL(sourceUrl);
    const issuedAtRaw = url.searchParams.get('s');
    const durationRaw = url.searchParams.get('e');

    if (issuedAtRaw === null || durationRaw === null) return null;

    const issuedAt = Number(issuedAtRaw);
    const duration = Number(durationRaw);

    if (
      !Number.isFinite(issuedAt) ||
      !Number.isFinite(duration) ||
      issuedAt <= 0 ||
      duration <= 0
    ) {
      return null;
    }

    return issuedAt + duration;
  } catch {
    return null;
  }
}

export function isLinkExpired(
  sourceUrl: string,
  marginSeconds: number = LINK_EXPIRY_MARGIN_SECONDS,
): boolean {
  const expiresAt = linkExpiresAt(sourceUrl);
  if (expiresAt === null) return false;
  return Date.now() / 1000 >= expiresAt - marginSeconds;
}

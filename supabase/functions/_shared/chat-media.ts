/** Only messages created and sent since this conversation was opened are eager media. */
export function isLiveChatMedia(message: {media_type?: string|null; wa_timestamp: number | string; created_at?: string|null}, openedAt: number) {
  if (!Number.isFinite(openedAt) || openedAt <= 0 || !['image', 'audio'].includes(message.media_type || '')) return false;
  const timestamp = Number(message.wa_timestamp);
  const sentAt = timestamp < 1e12 ? timestamp * 1000 : timestamp;
  const receivedAt = message.created_at ? Date.parse(message.created_at) : sentAt;
  return Number.isFinite(sentAt) && Number.isFinite(receivedAt) && sentAt >= openedAt && receivedAt >= openedAt;
}
/** Preserve a still-valid signed URL so receipt updates do not restart media downloads. */
export function keepChatMediaUrl(current: string | undefined, incoming: string) {
  if (!current) return incoming;
  try {
    const oldUrl = new URL(current), newUrl = new URL(incoming);
    if (oldUrl.origin !== newUrl.origin || oldUrl.pathname !== newUrl.pathname || !oldUrl.pathname.includes('/storage/v1/object/sign/')) return incoming;
    const token = oldUrl.searchParams.get('token') || '';
    const encoded = token.split('.')[1];
    const claims = JSON.parse(atob(encoded.replace(/-/g, '+').replace(/_/g, '/')));
    if (Number(claims.exp) * 1000 > Date.now() + 60000) return current;
  } catch { /* Best-effort fallback: the caller keeps the last valid state. */ }
  return incoming;
}

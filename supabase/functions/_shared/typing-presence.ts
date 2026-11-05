// Presence is best effort: a provider failure must never interrupt the secretary.
export function typingDurationMs(text: string): number {
  const length = Array.from(text.trim()).length;
  return length ? Math.min(6000, Math.max(1000, Math.ceil(length / 35 * 1000))) : 0;
}

export async function withTypingPresence<T>(apiUrl: string, token: string, number: string, prepare: () => Promise<T>, responseText?: (result: T) => string): Promise<T> {
  const started = Date.now();
  let pending: Promise<void> | undefined;
  const presence = async (state: 'composing' | 'paused') => {
    try {
      const response = await fetch(`${apiUrl.replace(/\/$/, '')}/message/presence`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json', apikey: token.split(':').pop()!, token, 'User-Agent': 'Mozilla/5.0'},
        body: JSON.stringify({number, state, isAudio: false}),
        signal: AbortSignal.timeout(1200),
      });
      await response.body?.cancel();
    } catch { /* Best-effort fallback: the caller keeps the last valid state. */ }
  };
  const refresh = () => {
    if (!pending) pending = presence('composing').finally(() => { pending = undefined; });
  };
  refresh();
  const timer = setInterval(refresh, 8000);
  try {
    const result = await prepare();
    if (responseText) {
      // Consultation time already counts toward typing; never add the full delay twice.
      const remaining = typingDurationMs(responseText(result)) - (Date.now() - started);
      if (remaining > 0) await new Promise(resolve => setTimeout(resolve, remaining));
    }
    return result;
  } finally {
    clearInterval(timer);
    // Preserve ordering so a slow composing request cannot arrive after paused.
    await pending;
    await presence('paused');
  }
}

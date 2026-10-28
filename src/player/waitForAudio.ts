interface LoadableAudio {
  isLoaded: boolean;
  addListener(name: 'playbackStatusUpdate', callback: (status: { isLoaded: boolean; error?: unknown }) => void): { remove(): void };
}

/** A cancelled audition must settle before another pair can reuse its controls. */
export function waitForAudio(player: LoadableAudio, signal: AbortSignal, timeoutMs = 15_000): Promise<void> {
  if (signal.aborted) return Promise.reject(new Error('Prévia cancelada.'));
  if (player.isLoaded) return Promise.resolve();
  return new Promise((resolve, reject) => {
    let subscription: { remove(): void } | undefined;
    const finish = (error?: Error) => {
      clearTimeout(timer); subscription?.remove(); signal.removeEventListener('abort', cancel);
      if (error) reject(error); else resolve();
    };
    const cancel = () => finish(new Error('Prévia cancelada.'));
    const timer = setTimeout(() => finish(new Error('O áudio demorou para carregar. Tente novamente.')), timeoutMs);
    signal.addEventListener('abort', cancel, { once: true });
    subscription = player.addListener('playbackStatusUpdate', status => {
      if (status.error) finish(new Error('Não foi possível carregar esta música.'));
      else if (status.isLoaded) finish();
    });
  });
}

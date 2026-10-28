/** Removing a player from Expo's registry does not release its native decoder. */
export function releasePlayer(player: { pause(): void; remove(): void; release(): void }): void {
  try { player.pause(); } catch { /* already stopped */ }
  try { player.remove(); } catch { /* already removed */ }
  try { player.release(); } catch { /* already released */ }
}

import { expect, it, vi } from 'vitest';
import { releasePlayer } from '../src/player/releasePlayer';
it('releases the decoder even if pausing or registry removal fails', () => {
  const player = { pause: vi.fn(() => { throw new Error('already stopped'); }), remove: vi.fn(() => { throw new Error('already removed'); }), release: vi.fn() };
  releasePlayer(player); expect(player.release).toHaveBeenCalledOnce();
});

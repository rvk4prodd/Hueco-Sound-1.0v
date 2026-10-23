import type { FadeCurve } from '../preferences/experience';

/** Gain envelope: no overlapping streams, clipping or extra audio players. */
export function transitionGain(time: number, duration: number, seconds: number, curve: FadeCurve): number {
  if (!Number.isFinite(time) || !Number.isFinite(seconds) || seconds <= 0) return 1;
  const window = duration > 0 ? Math.min(seconds, duration / 2) : seconds;
  const incoming = Math.max(0, Math.min(1, time / window));
  const outgoing = duration > 0 ? Math.max(0, Math.min(1, (duration - time) / window)) : 1;
  const gain = Math.min(incoming, outgoing);
  return curve === 'smooth' ? Math.sin(gain * Math.PI / 2) : gain;
}

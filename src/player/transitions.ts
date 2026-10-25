import type { FadeCurve } from '../preferences/experience';
import type { MixVolumeType } from '../types';

export type CrossfadeCurve = MixVolumeType | FadeCurve;

export interface CrossfadeFactors {
  outFactor: number;
  inFactor: number;
}

/**
 * Calculates dual-channel crossfade gain factors for outgoing (outFactor) and incoming (inFactor) tracks.
 * @param progress Normalized progress between 0 and 1
 * @param curve Volume curve style
 */
export function calculateCrossfadeFactors(progress: number, curve: CrossfadeCurve = 'overlap'): CrossfadeFactors {
  const t = Math.max(0, Math.min(1, progress));

  if (curve === 'cut') {
    return {
      outFactor: t < 0.5 ? 1 : 0,
      inFactor: t < 0.5 ? 0 : 1,
    };
  }

  if (curve === 'linear') {
    return {
      outFactor: 1 - t,
      inFactor: t,
    };
  }

  if (curve === 'equal_power') {
    return {
      outFactor: Math.cos(t * Math.PI * 0.5),
      inFactor: Math.sin(t * Math.PI * 0.5),
    };
  }

  if (curve === 'smooth') {
    return {
      outFactor: 0.5 * (1 + Math.cos(Math.PI * t)),
      inFactor: 0.5 * (1 - Math.cos(Math.PI * t)),
    };
  }

  // 'overlap' (default DJ curve: incoming rises fast, outgoing holds then drops on drop)
  const outFactor = t < 0.65 ? 1 : Math.cos(((t - 0.65) / 0.35) * Math.PI * 0.5);
  const inFactor = t < 0.35 ? Math.sin((t / 0.35) * Math.PI * 0.5) : 1;
  return {
    outFactor: Math.max(0, Math.min(1, outFactor)),
    inFactor: Math.max(0, Math.min(1, inFactor)),
  };
}

/** Legacy gain helper for single-deck soft edges if needed */
export function transitionGain(time: number, duration: number, seconds: number, curve: FadeCurve): number {
  if (!Number.isFinite(time) || !Number.isFinite(seconds) || seconds <= 0) return 1;
  const window = duration > 0 ? Math.min(seconds, duration / 2) : seconds;
  const incoming = Math.max(0, Math.min(1, time / window));
  const outgoing = duration > 0 ? Math.max(0, Math.min(1, (duration - time) / window)) : 1;
  const gain = Math.min(incoming, outgoing);
  return curve === 'smooth' ? Math.sin(gain * Math.PI / 2) : gain;
}

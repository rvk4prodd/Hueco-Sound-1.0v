export interface MixPoint { time: number; gain: number; }
export interface MixCurves { out: MixPoint[]; in: MixPoint[]; }
export interface MixAutomation { volume?: string; eq?: string; effect?: string; amount?: number; eqAmount?: number; curves?: MixCurves; bpm?: number; }
export interface DeckTone { bassDb: number; lowpass: number; highpass: number; reverb: number; }
export const FLAT_TONE: DeckTone = { bassDb: 0, lowpass: 20000, highpass: 20, reverb: 0 };
const clamp = (n: number, low: number, high: number) => Math.min(high, Math.max(low, Number.isFinite(n) ? n : low));
export function envelope(points: MixPoint[] | undefined, t: number, fallback: number): number {
  if (!Array.isArray(points) || points.length < 2) return fallback;
  const sorted = points.slice(0, 8).filter(p => Number.isFinite(p.time) && Number.isFinite(p.gain)).map(p => ({ time: clamp(p.time, 0, 1), gain: clamp(p.gain, 0, 1) })).sort((a, b) => a.time - b.time);
  if (sorted.length < 2) return fallback;
  if (t <= sorted[0].time) return sorted[0].gain;
  for (let i = 1; i < sorted.length; i++) if (t <= sorted[i].time) { const a = sorted[i - 1], b = sorted[i]; return a.gain + (b.gain - a.gain) * clamp((t - a.time) / Math.max(.001, b.time - a.time), 0, 1); }
  return sorted[sorted.length - 1].gain;
}
export function mixFrame(progress: number, config: MixAutomation = {}) {
  const t = clamp(progress, 0, 1), volume = config.volume || 'equal_power';
  let out = Math.cos(t * Math.PI / 2), incoming = Math.sin(t * Math.PI / 2);
  if (volume === 'linear' || volume === 'fade') { out = 1 - t; incoming = t; }
  if (volume === 'cut') { out = t < .5 ? 1 : 0; incoming = t < .5 ? 0 : 1; }
  if (volume === 'rise') { out = (1 - t) ** 1.4; incoming = t ** .7; }
  if (volume === 'overlap' || volume === 'blend') { out = t < .65 ? 1 : Math.cos((t - .65) / .35 * Math.PI / 2); incoming = t < .35 ? Math.sin(t / .35 * Math.PI / 2) : 1; }
  const outgoingTone = { ...FLAT_TONE }, incomingTone = { ...FLAT_TONE };
  const db = clamp(config.eqAmount ?? 18, 0, 24), amount = clamp(config.amount ?? .6, 0, 1);
  const swap = config.eq === 'early_bass_swap' ? .25 : config.eq === 'end_bass_swap' ? .75 : .5;
  if (['early_bass_swap', 'center_bass_swap', 'end_bass_swap'].includes(config.eq || '')) {
    outgoingTone.bassDb = -db * clamp((t - swap + .15) / .3, 0, 1);
    incomingTone.bassDb = -db * (1 - clamp((t - swap + .15) / .3, 0, 1));
  } else if (config.eq === 'bass_cut') { outgoingTone.bassDb = -db * Math.sin(t * Math.PI); incomingTone.bassDb = outgoingTone.bassDb; }
  if (config.effect === 'low_pass') { outgoingTone.lowpass = 20000 * (.025 ** (t * amount)); incomingTone.lowpass = 20000 * (.025 ** ((1 - t) * amount)); }
  if (config.effect === 'high_pass' || config.effect === 'rise') { outgoingTone.highpass = 20 * (200 ** (t * amount)); incomingTone.highpass = 20 * (200 ** ((1 - t) * amount)); }
  if (config.effect === 'reverb' || config.effect === 'reverb_tail') { outgoingTone.reverb = t * amount; incomingTone.reverb = (1 - t) * amount * .3; }
  outgoingTone.bassDb = outgoingTone.bassDb || 0; incomingTone.bassDb = incomingTone.bassDb || 0;
  return { out: envelope(config.curves?.out, t, out), in: envelope(config.curves?.in, t, incoming), outgoingTone, incomingTone };
}
export function defaultCurves(volume = 'equal_power'): MixCurves {
  const times = [0, .25, .5, .75, 1];
  return { out: times.map(time => ({ time, gain: mixFrame(time, { volume }).out })), in: times.map(time => ({ time, gain: mixFrame(time, { volume }).in })) };
}
export function effectLevel(tone: DeckTone) { return Math.max(tone.reverb, Math.log(20000 / tone.lowpass) / Math.log(40), Math.log(tone.highpass / 20) / Math.log(200)); }
export function barsToSeconds(bars: number, bpm: number) { return clamp(bars * 4 * 60 / clamp(bpm, 40, 240), 1, 96); }

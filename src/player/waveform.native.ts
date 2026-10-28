import { requireNativeModule } from 'expo';
import type { Track } from '../types';
import { resolveAudioStream } from '../api/innertube';
import { getPlaybackTrack } from '../library/useDeviceLibraryStore';
import { preparePlaybackSource } from './prepareSource';
export interface Waveform { peaks: number[]; duration: number; }
const cache = new Map<string, Waveform>();
let sequence = 0;
export async function analyzeWaveform(track: Track, signal: AbortSignal): Promise<Waveform> {
  if (cache.has(track.id)) return cache.get(track.id)!;
  const module = requireNativeModule('ExpoAudio') as { analyzeHuecoWaveform?: (uri: string, job: string) => Promise<Waveform>; cancelHuecoWaveform?: (job: string) => void };
  if (!module.analyzeHuecoWaveform) throw new Error('A forma de onda precisa do novo APK.');
  const local = getPlaybackTrack(track).streamUrl;
  const uri = local || await preparePlaybackSource(await resolveAudioStream(track.id, track.title, track.artists, { signal, durationMs: track.durationMs }), signal);
  if (signal.aborted) throw new Error('Análise cancelada.');
  const job = `wave-${++sequence}`;
  const cancel = () => module.cancelHuecoWaveform?.(job);
  signal.addEventListener('abort', cancel, { once: true });
  let waveform: Waveform;
  try { waveform = await module.analyzeHuecoWaveform(uri, job); } finally { signal.removeEventListener('abort', cancel); }
  if (signal.aborted) throw new Error('Análise cancelada.');
  cache.set(track.id, waveform); if (cache.size > 32) cache.delete(cache.keys().next().value!);
  return waveform;
}

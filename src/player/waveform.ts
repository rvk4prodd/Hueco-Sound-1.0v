import type { Track } from '../types';
export interface Waveform { peaks: number[]; duration: number; }
export async function analyzeWaveform(_track: Track, _signal: AbortSignal): Promise<Waveform> { throw new Error('Análise da forma de onda disponível no aplicativo Android.'); }

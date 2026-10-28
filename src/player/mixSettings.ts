import type { TrackTransitionConfig } from '../types';

export const MIX_PRESETS = [
  { id: 'auto', label: 'Auto', description: 'Mistura equilibrada de 4 segundos.', seconds: 4, volume: 'equal_power' },
  { id: 'fade', label: 'Suave', description: 'Uma música baixa enquanto a próxima entra.', seconds: 6, volume: 'linear' },
  { id: 'bass_drop', label: 'Corte', description: 'Troca direta entre as duas faixas.', seconds: 1, volume: 'cut' },
] as const;

export function mixPreset(id: string): TrackTransitionConfig {
  const preset = MIX_PRESETS.find(p => p.id === id) || MIX_PRESETS[0];
  return { durationSeconds: preset.seconds, volume: preset.volume, eq: 'none', effect: 'none', preset: preset.id };
}

export function mixPoints(config: TrackTransitionConfig, durationA: number, durationB: number) {
  const seconds = Math.min(12, Math.max(1, config.durationSeconds || 4), Math.max(1, durationA / 2), Math.max(1, durationB / 2));
  const out = config.outPointSec ?? (config.outCueSec !== undefined ? durationA - config.outCueSec : durationA - seconds);
  return { seconds, out: Math.max(0, Math.min(durationA - seconds, out)), in: Math.max(0, Math.min(durationB - seconds, config.inPointSec ?? config.inCueSec ?? 0)) };
}

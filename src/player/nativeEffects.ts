export interface NativeEffectsConfig {
  enabled: boolean; eq: number[]; reverb: number; width: number;
  compressor: boolean; threshold: number; ratio: number;
  speed: number; linked: boolean; pitch: number;
}
export function applyNativeEffects(_config: NativeEffectsConfig): boolean { return false; }

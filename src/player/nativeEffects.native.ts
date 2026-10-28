import { requireNativeModule } from 'expo';
import type { NativeEffectsConfig } from './nativeEffects';
export type { NativeEffectsConfig } from './nativeEffects';
export function applyNativeEffects(config: NativeEffectsConfig): boolean {
  try {
    const module = requireNativeModule('ExpoAudio') as { setHuecoEffects?: (config: NativeEffectsConfig) => void };
    if (!module.setHuecoEffects) return false;
    module.setHuecoEffects(config);
    return true;
  } catch { return false; }
}

import { requireNativeModule } from 'expo';
import type { NativeEffectsConfig } from './nativeEffects';
export type { NativeEffectsConfig } from './nativeEffects';
export function applyDeckTone(id: string, tone: import('./mixAutomation').DeckTone): boolean {
  try { const module = requireNativeModule('ExpoAudio') as { setHuecoDeckEffects?: (id: string, tone: unknown) => void }; if (!module.setHuecoDeckEffects) return false; module.setHuecoDeckEffects(id, tone); return true; } catch { return false; }
}
export function applyNativeEffects(config: NativeEffectsConfig): boolean {
  try {
    const module = requireNativeModule('ExpoAudio') as { setHuecoEffects?: (config: NativeEffectsConfig) => void };
    if (!module.setHuecoEffects) return false;
    module.setHuecoEffects(config);
    return true;
  } catch { return false; }
}

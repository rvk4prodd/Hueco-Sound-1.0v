import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useUIStore } from '../ui/useUIStore';

export type AudioTransition = 'direct' | 'fade';
export type FadeCurve = 'smooth' | 'linear';
export type VisualTransition = 'slide' | 'fade' | 'zoom' | 'none';
export interface ExperiencePreferences {
  audioTransition: AudioTransition;
  transitionSeconds: number;
  fadeCurve: FadeCurve;
  visualTransition: VisualTransition;
  glassEnabled: boolean;
  visualizerEnabled: boolean;
  spritesEnabled: boolean;
}
export const defaultExperience: ExperiencePreferences = {
  audioTransition: 'fade', transitionSeconds: 3, fadeCurve: 'smooth', visualTransition: 'slide',
  glassEnabled: true, visualizerEnabled: true, spritesEnabled: true,
};
export function validatedExperience(raw: unknown): ExperiencePreferences {
  const data = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  return {
    audioTransition: data.audioTransition === 'fade' ? 'fade' : 'direct',
    transitionSeconds: typeof data.transitionSeconds === 'number' && Number.isFinite(data.transitionSeconds) ? Math.max(1, Math.min(8, data.transitionSeconds)) : 3,
    fadeCurve: data.fadeCurve === 'linear' ? 'linear' : 'smooth',
    visualTransition: ['slide', 'fade', 'zoom', 'none'].includes(String(data.visualTransition)) ? data.visualTransition as VisualTransition : 'slide',
    glassEnabled: typeof data.glassEnabled === 'boolean' ? data.glassEnabled : true,
    visualizerEnabled: typeof data.visualizerEnabled === 'boolean' ? data.visualizerEnabled : true,
    spritesEnabled: typeof data.spritesEnabled === 'boolean' ? data.spritesEnabled : true,
  };
}
export const useExperienceStore = create<ExperiencePreferences & { configure: (values: Partial<ExperiencePreferences>) => void }>()(persist(
  (set, get) => ({ ...defaultExperience, configure: values => set(validatedExperience({ ...get(), ...values })) }),
  { name: '@hueco_experience_v1', storage: createJSONStorage(() => ({
    getItem: (key: string) => AsyncStorage.getItem(key).catch(() => null),
    setItem: (key: string, value: string) => AsyncStorage.setItem(key, value).catch(() => useUIStore.getState().notify('Não foi possível salvar as preferências neste aparelho.')),
    removeItem: (key: string) => AsyncStorage.removeItem(key).catch(() => useUIStore.getState().notify('Não foi possível remover as preferências salvas.')),
  })), partialize: state => validatedExperience(state), merge: (persisted, current) => ({ ...current, ...validatedExperience(persisted) }) },
));

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useUIStore } from '../ui/useUIStore';
import type { AudioNormalizationMode, GestureControlsConfig, LyricsFXStyle, VisualizerMode } from '../types';

export type AudioTransition = 'direct' | 'fade';
export type FadeCurve = 'smooth' | 'linear';
export type VisualTransition = 'slide' | 'fade' | 'zoom' | 'none';
export type AccentTheme = 'cyan' | 'purple' | 'emerald' | 'amber' | 'rose' | 'crimson' | 'gold' | 'blue' | 'white';
export type WallpaperPreset = 'default' | 'neon' | 'cyberpunk' | 'midnight' | 'aurora' | 'sunset' | 'custom';

export interface ExperiencePreferences {
  audioTransition: AudioTransition;
  transitionSeconds: number;
  fadeCurve: FadeCurve;
  visualTransition: VisualTransition;
  glassEnabled: boolean;
  visualizerEnabled: boolean;
  visualizerMode: VisualizerMode;
  spritesEnabled: boolean;
  customWallpaperUri: string | null;
  wallpaperPreset: WallpaperPreset;
  glassBlurIntensity: number;
  glassOpacity: number;
  accentTheme: AccentTheme;
  // Lyrics FX Studio
  lyricsFXStyle: LyricsFXStyle;
  lyricsFontSize: 'small' | 'medium' | 'large' | 'xlarge';
  lyricsGlow: boolean;
  // Audio Normalization
  normalizationMode: AudioNormalizationMode;
  // Gestures
  gestures: GestureControlsConfig;
  // Theme Creator JSON export/import
  customThemeJson: string | null;
}

export const defaultExperience: ExperiencePreferences = {
  audioTransition: 'fade',
  transitionSeconds: 3,
  fadeCurve: 'smooth',
  visualTransition: 'slide',
  glassEnabled: true,
  visualizerEnabled: true,
  visualizerMode: 'bars',
  spritesEnabled: true,
  customWallpaperUri: null,
  wallpaperPreset: 'default',
  glassBlurIntensity: 25,
  glassOpacity: 0.85,
  accentTheme: 'cyan',
  lyricsFXStyle: 'neon_amv',
  lyricsFontSize: 'medium',
  lyricsGlow: true,
  normalizationMode: 'balanced',
  gestures: {
    doubleTapSeekSeconds: 10,
    swipeToChangeTrack: true,
    swipeToOpenPlayer: true,
    doubleTapLike: true,
  },
  customThemeJson: null,
};

export function validatedExperience(raw: unknown): ExperiencePreferences {
  const data = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  const g = (data.gestures && typeof data.gestures === 'object' ? data.gestures : {}) as Record<string, unknown>;

  return {
    audioTransition: data.audioTransition === 'fade' ? 'fade' : 'direct',
    transitionSeconds: typeof data.transitionSeconds === 'number' && Number.isFinite(data.transitionSeconds) ? Math.max(1, Math.min(8, data.transitionSeconds)) : 3,
    fadeCurve: data.fadeCurve === 'linear' ? 'linear' : 'smooth',
    visualTransition: ['slide', 'fade', 'zoom', 'none'].includes(String(data.visualTransition)) ? data.visualTransition as VisualTransition : 'slide',
    glassEnabled: typeof data.glassEnabled === 'boolean' ? data.glassEnabled : true,
    visualizerEnabled: typeof data.visualizerEnabled === 'boolean' ? data.visualizerEnabled : true,
    visualizerMode: ['bars', 'wave', 'circle', 'particles'].includes(String(data.visualizerMode)) ? data.visualizerMode as VisualizerMode : 'bars',
    spritesEnabled: typeof data.spritesEnabled === 'boolean' ? data.spritesEnabled : true,
    customWallpaperUri: typeof data.customWallpaperUri === 'string' && data.customWallpaperUri.trim() ? data.customWallpaperUri : null,
    wallpaperPreset: ['default', 'neon', 'cyberpunk', 'midnight', 'aurora', 'sunset', 'custom'].includes(String(data.wallpaperPreset)) ? data.wallpaperPreset as WallpaperPreset : 'default',
    glassBlurIntensity: typeof data.glassBlurIntensity === 'number' && Number.isFinite(data.glassBlurIntensity) ? Math.max(0, Math.min(100, data.glassBlurIntensity)) : 25,
    glassOpacity: typeof data.glassOpacity === 'number' && Number.isFinite(data.glassOpacity) ? Math.max(0.1, Math.min(1, data.glassOpacity)) : 0.85,
    accentTheme: ['cyan', 'purple', 'emerald', 'amber', 'rose', 'crimson', 'gold', 'blue', 'white'].includes(String(data.accentTheme)) ? data.accentTheme as AccentTheme : 'cyan',
    lyricsFXStyle: ['clean', 'neon_amv', 'kinetic_zoom', 'subtle_shake', 'karaoke_fill'].includes(String(data.lyricsFXStyle)) ? data.lyricsFXStyle as LyricsFXStyle : 'neon_amv',
    lyricsFontSize: ['small', 'medium', 'large', 'xlarge'].includes(String(data.lyricsFontSize)) ? data.lyricsFontSize as 'small' | 'medium' | 'large' | 'xlarge' : 'medium',
    lyricsGlow: typeof data.lyricsGlow === 'boolean' ? data.lyricsGlow : true,
    normalizationMode: ['off', 'balanced', 'loud', 'quiet'].includes(String(data.normalizationMode)) ? data.normalizationMode as AudioNormalizationMode : 'balanced',
    gestures: {
      doubleTapSeekSeconds: typeof g.doubleTapSeekSeconds === 'number' ? g.doubleTapSeekSeconds : 10,
      swipeToChangeTrack: typeof g.swipeToChangeTrack === 'boolean' ? g.swipeToChangeTrack : true,
      swipeToOpenPlayer: typeof g.swipeToOpenPlayer === 'boolean' ? g.swipeToOpenPlayer : true,
      doubleTapLike: typeof g.doubleTapLike === 'boolean' ? g.doubleTapLike : true,
    },
    customThemeJson: typeof data.customThemeJson === 'string' ? data.customThemeJson : null,
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

import { validatedExperience, type ExperiencePreferences } from './experience';

const themeKeys = ['accentTheme', 'wallpaperPreset', 'glassBlurIntensity', 'glassOpacity', 'glassEnabled', 'visualizerMode', 'lyricsFXStyle'] as const;

/** Shared themes may change appearance only; device files and playback preferences stay local. */
export function importTheme(raw: unknown, current: ExperiencePreferences): Partial<ExperiencePreferences> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Tema inválido');
  const source = raw as Record<string, unknown>;
  const selected = Object.fromEntries(themeKeys.filter(key => Object.hasOwn(source, key)).map(key => [key, source[key]]));
  if (!Object.keys(selected).length) throw new Error('Nenhuma opção de aparência encontrada');
  const valid = validatedExperience({ ...current, ...selected });
  return Object.fromEntries(Object.keys(selected).map(key => [key, valid[key as typeof themeKeys[number]]]));
}

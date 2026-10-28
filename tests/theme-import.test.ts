import { describe, expect, it, vi } from 'vitest';
vi.mock('@react-native-async-storage/async-storage', () => ({ default: { getItem: async () => null } }));
import { importTheme } from '../src/preferences/themeImport';
import { defaultExperience } from '../src/preferences/experience';
describe('shared appearance preferences', () => {
  it('imports appearance while ignoring audio, gestures and private file paths', () => {
    const result = importTheme({ accentTheme: 'rose', glassOpacity: .5, audioTransition: 'direct', customWallpaperUri: 'file:///private/photo.jpg', gestures: {} }, defaultExperience);
    expect(result).toEqual({ accentTheme: 'rose', glassOpacity: .5 });
  });
  it('rejects unrelated data and clamps invalid theme values', () => {
    expect(() => importTheme({ password: 'example' }, defaultExperience)).toThrow();
    expect(() => importTheme(null, defaultExperience)).toThrow();
    expect(importTheme({ glassOpacity: 50, glassBlurIntensity: -1 }, defaultExperience)).toEqual({ glassOpacity: 1, glassBlurIntensity: 0 });
  });
});

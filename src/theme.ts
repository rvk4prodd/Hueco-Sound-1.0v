import { StyleSheet, type ViewStyle, type TextStyle, type ImageStyle } from 'react-native';
import { useExperienceStore } from './preferences/experience';
const accents = { cyan: '#64f4d4', purple: '#b69cff', emerald: '#64e8a6', amber: '#ffd182', rose: '#ff9eb9', crimson: '#ff8989', gold: '#f5dc77', blue: '#8bbdff', white: '#eefaf8' };
export const colors = { background: '#060c10', surface: '#101d22', elevated: '#1b3035', text: '#eefaf8', muted: '#92aaa9', get accent() { return accents[useExperienceStore.getState().accentTheme] || accents.cyan; }, border: '#24413f', danger: '#ff9baf', glass: '#102c2a99', glow: '#64f4d425' };
export function useHuecoTheme(): void { useExperienceStore(s => s.accentTheme); }
/** Recompute registered styles only when the chosen palette changes. */
export function themedStyles<const T extends Record<string, ViewStyle | TextStyle | ImageStyle>>(factory: () => T): T {
  let accent = '', cache: T;
  return new Proxy({} as T, { get: (_target, key) => {
    if (accent !== colors.accent) { accent = colors.accent; cache = StyleSheet.create(factory()); }
    return cache[key as keyof T];
  } });
}
export function coverColor(seed: string): string { let hash = 0; for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0; return `hsl(${165 + Math.abs(hash) % 35}, 35%, 16%)`; }
export function formatTime(ms: number): string { const s = Math.floor(Math.max(0, Number.isFinite(ms) ? ms : 0) / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }

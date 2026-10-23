import { beforeEach, expect, it, vi } from 'vitest';
import { transitionGain } from '../src/player/transitions';

const memory = vi.hoisted(() => new Map<string, string>());
vi.mock('@react-native-async-storage/async-storage', () => ({ default: {
  getItem: async (key: string) => memory.get(key) || null,
  setItem: async (key: string, value: string) => { memory.set(key, value); },
  removeItem: async (key: string) => { memory.delete(key); },
} }));
beforeEach(() => memory.clear());

it('fades the beginning and end while preserving full gain through the middle', () => {
  expect(transitionGain(0, 120, 3, 'linear')).toBe(0);
  expect(transitionGain(1.5, 120, 3, 'linear')).toBe(.5);
  expect(transitionGain(60, 120, 3, 'linear')).toBe(1);
  expect(transitionGain(118.5, 120, 3, 'linear')).toBe(.5);
  expect(transitionGain(120, 120, 3, 'linear')).toBe(0);
  expect(transitionGain(1.5, 120, 3, 'smooth')).toBeCloseTo(Math.SQRT1_2);
});
it('keeps gain finite for short tracks, missing duration, seeks and malformed times', () => {
  expect(transitionGain(1, 2, 8, 'linear')).toBe(1);
  expect(transitionGain(-5, 120, 3, 'smooth')).toBe(0);
  expect(transitionGain(900, 120, 3, 'smooth')).toBe(0);
  expect(transitionGain(1, 0, 3, 'linear')).toBeCloseTo(1 / 3);
  expect(transitionGain(NaN, 120, 3, 'smooth')).toBe(1);
});
it('validates corrupted preferences and restores the saved settings after reopening', async () => {
  const { useExperienceStore, validatedExperience } = await import('../src/preferences/experience');
  expect(validatedExperience({ transitionSeconds: Infinity, audioTransition: 'invalid', visualTransition: 'invalid' })).toMatchObject({ transitionSeconds: 3, audioTransition: 'direct', visualTransition: 'slide' });
  expect(validatedExperience({ transitionSeconds: 900 }).transitionSeconds).toBe(8);
  await useExperienceStore.persist.rehydrate();
  useExperienceStore.getState().configure({ audioTransition: 'fade', transitionSeconds: 5, fadeCurve: 'linear', visualTransition: 'zoom', glassEnabled: false });
  await Promise.resolve();
  const persisted = memory.get('@hueco_experience_v1');
  expect(JSON.parse(persisted!).state).toMatchObject({ audioTransition: 'fade', transitionSeconds: 5, glassEnabled: false });
  vi.resetModules();
  const reopened = (await import('../src/preferences/experience')).useExperienceStore;
  await reopened.persist.rehydrate();
  expect(reopened.getState()).toMatchObject({ audioTransition: 'fade', transitionSeconds: 5, fadeCurve: 'linear', visualTransition: 'zoom', glassEnabled: false });
});

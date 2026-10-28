import { expect, it, vi, afterEach } from 'vitest';
import { mixPoints, mixPreset } from '../src/player/mixSettings';
import { waitForAudio } from '../src/player/waitForAudio';
afterEach(() => vi.useRealTimers());

it('creates presets that only request implemented volume transitions', () => {
  expect(mixPreset('auto')).toMatchObject({ durationSeconds: 4, eq: 'none', effect: 'none', volume: 'equal_power' });
  expect(mixPreset('bass_drop').volume).toBe('cut');
  expect(mixPreset('fade').volume).toBe('linear');
});
it('bounds both cue points and the overlap to actual song durations', () => {
  expect(mixPoints({ ...mixPreset('fade'), outPointSec: 999, inPointSec: -10 }, 100, 40)).toEqual({ seconds: 6, out: 94, in: 0 });
  expect(mixPoints(mixPreset('fade'), 4, 8)).toEqual({ seconds: 2, out: 2, in: 0 });
});
it('rejects a stalled or cancelled audition and removes native listeners', async () => {
  vi.useFakeTimers();
  const remove = vi.fn();
  const player = { isLoaded: false, addListener: vi.fn(() => ({ remove })) };
  const controller = new AbortController();
  const stalled = waitForAudio(player, controller.signal);
  const timedOut = expect(stalled).rejects.toThrow('demorou');
  await vi.advanceTimersByTimeAsync(15000); await timedOut;
  expect(remove).toHaveBeenCalledOnce();
  const cancelled = waitForAudio(player, controller.signal);
  controller.abort(); await expect(cancelled).rejects.toThrow('cancelada');
  expect(remove).toHaveBeenCalledTimes(2);
});

import { describe, expect, it } from 'vitest';
import { barsToSeconds, defaultCurves, envelope, mixFrame } from '../src/player/mixAutomation';
describe('editable mix automation', () => {
  it('follows user volume points and clamps malformed input', () => {
    const curves = defaultCurves('linear'); curves.out[2].gain = .15;
    expect(mixFrame(.5, { curves }).out).toBeCloseTo(.15);
    expect(envelope([{ time: 0, gain: -2 }, { time: 1, gain: 2 }], .5, 0)).toBeCloseTo(.5);
  });
  it('swaps bass at the selected part without attenuating both tracks forever', () => {
    const early = mixFrame(.45, { eq: 'early_bass_swap' }), late = mixFrame(.45, { eq: 'end_bass_swap' });
    expect(early.outgoingTone.bassDb).toBe(-18); expect(early.incomingTone.bassDb).toBe(0);
    expect(late.outgoingTone.bassDb).toBe(0); expect(late.incomingTone.bassDb).toBe(-18);
    expect(mixFrame(1, { eq: 'end_bass_swap' }).incomingTone.bassDb).toBe(0);
  });
  it('drives independent filters and wet levels at the selected intensity', () => {
    expect(mixFrame(.9, { effect: 'low_pass', amount: 1 }).outgoingTone.lowpass).toBeLessThan(1000);
    expect(mixFrame(.9, { effect: 'high_pass', amount: 1 }).outgoingTone.highpass).toBeGreaterThan(2000);
    expect(mixFrame(.5, { effect: 'reverb', amount: 0 }).outgoingTone.reverb).toBe(0);
    expect(mixFrame(.5, { effect: 'reverb', amount: 1 }).outgoingTone.reverb).toBeCloseTo(.5);
  });
  it('converts 4/4 bars using the explicit manual BPM', () => { expect(barsToSeconds(4, 120)).toBe(8); expect(barsToSeconds(4, 60)).toBe(16); expect(barsToSeconds(16, 40)).toBe(96); });
});

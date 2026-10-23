import React, { useEffect, useState } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { useExperienceStore } from '../preferences/experience';
import { usePlayerStore } from '../player/usePlayerStore';
import { colors } from '../theme';

/** Decorative playback indicator; never presented as an FFT/audio measurement. */
export function PlaybackWaves({ active = true }: { active?: boolean }) {
  const playing = usePlayerStore(s => s.isPlaying), reduced = usePlayerStore(s => s.reducedMotion);
  const enabled = useExperienceStore(s => s.visualizerEnabled);
  const [bars] = useState(() => Array.from({ length: 13 }, () => new Animated.Value(.2)));
  useEffect(() => {
    if (!playing || reduced || !enabled || !active) { bars.forEach(bar => bar.setValue(.2)); return; }
    const animation = Animated.parallel(bars.map((bar, index) => Animated.loop(Animated.sequence([
      Animated.timing(bar, { toValue: .45 + (index % 4) * .17, duration: 260 + (index % 5) * 80, useNativeDriver: true }),
      Animated.timing(bar, { toValue: .16, duration: 330 + (index % 3) * 100, useNativeDriver: true }),
    ]))));
    animation.start(); return () => animation.stop();
  }, [active, bars, enabled, playing, reduced]);
  if (!enabled) return null;
  return <View accessibilityLabel="Animação de reprodução" style={s.row}>{bars.map((bar, i) => <Animated.View key={i} style={[s.bar, { height: 23 + (6 - Math.abs(6 - i)) * 3, opacity: .35 + (i % 3) * .2, transform: [{ scaleY: bar }] }]} />)}</View>;
}
const s = StyleSheet.create({ row: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 5, height: 38, marginTop: 4 }, bar: { width: 4, borderRadius: 3, backgroundColor: colors.accent } });

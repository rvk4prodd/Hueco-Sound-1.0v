import React, { useEffect, useState } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { useExperienceStore } from '../preferences/experience';
import { usePlayerStore } from '../player/usePlayerStore';
import { colors } from '../theme';

/**
 * Music Visualizer supporting 4 reactive visual modes:
 * - bars: Dynamic frequency spectrum bars
 * - wave: Smooth liquid sine wave
 * - circle: Concentric pulsing rings
 * - particles: Ambient floating particles
 */
export function PlaybackWaves({ active = true }: { active?: boolean }) {
  const playing = usePlayerStore(s => s.isPlaying);
  const reduced = usePlayerStore(s => s.reducedMotion);
  const enabled = useExperienceStore(s => s.visualizerEnabled);
  const mode = useExperienceStore(s => s.visualizerMode) || 'bars';

  // 1. Bars state
  const [bars] = useState(() => Array.from({ length: 15 }, () => new Animated.Value(0.2)));

  // 2. Wave state
  const [wavePoints] = useState(() => Array.from({ length: 11 }, () => new Animated.Value(0.3)));

  // 3. Circle rings state
  const [ringScale] = useState(() => new Animated.Value(0.7));
  const [ringOpacity] = useState(() => new Animated.Value(0.8));

  // 4. Particles state
  const [particles] = useState(() =>
    Array.from({ length: 8 }, () => ({
      y: new Animated.Value(0),
      opacity: new Animated.Value(0.2),
      scale: new Animated.Value(0.6),
    }))
  );

  useEffect(() => {
    if (!playing || reduced || !enabled || !active) {
      bars.forEach(b => b.setValue(0.2));
      wavePoints.forEach(p => p.setValue(0.3));
      ringScale.setValue(0.7);
      ringOpacity.setValue(0.4);
      particles.forEach(p => {
        p.y.setValue(0);
        p.opacity.setValue(0.2);
        p.scale.setValue(0.6);
      });
      return;
    }

    if (mode === 'bars') {
      const anim = Animated.parallel(
        bars.map((bar, i) =>
          Animated.loop(
            Animated.sequence([
              Animated.timing(bar, {
                toValue: 0.35 + (i % 5) * 0.16,
                duration: 220 + (i % 4) * 70,
                useNativeDriver: true,
              }),
              Animated.timing(bar, {
                toValue: 0.12,
                duration: 280 + (i % 3) * 90,
                useNativeDriver: true,
              }),
            ])
          )
        )
      );
      anim.start();
      return () => anim.stop();
    }

    if (mode === 'wave') {
      const anim = Animated.parallel(
        wavePoints.map((pt, i) =>
          Animated.loop(
            Animated.sequence([
              Animated.timing(pt, {
                toValue: 0.95,
                duration: 350 + i * 40,
                useNativeDriver: true,
              }),
              Animated.timing(pt, {
                toValue: 0.25,
                duration: 350 + i * 40,
                useNativeDriver: true,
              }),
            ])
          )
        )
      );
      anim.start();
      return () => anim.stop();
    }

    if (mode === 'circle') {
      const anim = Animated.loop(
        Animated.parallel([
          Animated.sequence([
            Animated.timing(ringScale, {
              toValue: 1.35,
              duration: 750,
              useNativeDriver: true,
            }),
            Animated.timing(ringScale, {
              toValue: 0.85,
              duration: 750,
              useNativeDriver: true,
            }),
          ]),
          Animated.sequence([
            Animated.timing(ringOpacity, {
              toValue: 1,
              duration: 400,
              useNativeDriver: true,
            }),
            Animated.timing(ringOpacity, {
              toValue: 0.3,
              duration: 1100,
              useNativeDriver: true,
            }),
          ]),
        ])
      );
      anim.start();
      return () => anim.stop();
    }

    if (mode === 'particles') {
      const anim = Animated.parallel(
        particles.map((p, i) =>
          Animated.loop(
            Animated.sequence([
              Animated.delay(i * 120),
              Animated.parallel([
                Animated.timing(p.y, {
                  toValue: -28,
                  duration: 900 + (i % 3) * 200,
                  useNativeDriver: true,
                }),
                Animated.sequence([
                  Animated.timing(p.opacity, {
                    toValue: 0.9,
                    duration: 300,
                    useNativeDriver: true,
                  }),
                  Animated.timing(p.opacity, {
                    toValue: 0,
                    duration: 600 + (i % 3) * 200,
                    useNativeDriver: true,
                  }),
                ]),
                Animated.timing(p.scale, {
                  toValue: 1.2,
                  duration: 900,
                  useNativeDriver: true,
                }),
              ]),
              Animated.timing(p.y, { toValue: 0, duration: 0, useNativeDriver: true }),
            ])
          )
        )
      );
      anim.start();
      return () => anim.stop();
    }
  }, [active, bars, enabled, mode, particles, playing, reduced, ringOpacity, ringScale, wavePoints]);

  if (!enabled) return null;

  if (mode === 'wave') {
    return (
      <View accessibilityLabel="Visualizador em Onda" style={s.waveContainer}>
        {wavePoints.map((pt, i) => (
          <Animated.View
            key={i}
            style={[
              s.waveBar,
              {
                opacity: 0.5 + (i % 4) * 0.12,
                transform: [{ scaleY: pt }],
              },
            ]}
          />
        ))}
      </View>
    );
  }

  if (mode === 'circle') {
    return (
      <View accessibilityLabel="Visualizador em Anéis" style={s.circleContainer}>
        <Animated.View
          style={[
            s.ringOuter,
            {
              transform: [{ scale: ringScale }],
              opacity: ringOpacity,
            },
          ]}
        />
        <Animated.View
          style={[
            s.ringInner,
            {
              transform: [{ scale: ringScale }],
            },
          ]}
        />
      </View>
    );
  }

  if (mode === 'particles') {
    return (
      <View accessibilityLabel="Visualizador em Partículas" style={s.particlesContainer}>
        {particles.map((p, i) => (
          <Animated.View
            key={i}
            style={[
              s.particle,
              {
                opacity: p.opacity,
                transform: [{ translateY: p.y }, { scale: p.scale }],
                backgroundColor: i % 2 === 0 ? colors.accent : '#a855f7',
              },
            ]}
          />
        ))}
      </View>
    );
  }

  // Default: Bars
  return (
    <View accessibilityLabel="Visualizador em Barras" style={s.row}>
      {bars.map((bar, i) => (
        <Animated.View
          key={i}
          style={[
            s.bar,
            {
              height: 24 + (7 - Math.abs(7 - i)) * 3,
              opacity: 0.35 + (i % 3) * 0.22,
              transform: [{ scaleY: bar }],
            },
          ]}
        />
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 4,
    height: 38,
    marginTop: 4,
  },
  bar: {
    width: 3.5,
    borderRadius: 3,
    backgroundColor: colors.accent,
  },
  waveContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 5,
    height: 38,
    marginTop: 4,
  },
  waveBar: {
    width: 4,
    height: 28,
    borderRadius: 2,
    backgroundColor: '#00e5ff',
  },
  circleContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    height: 38,
    marginTop: 4,
  },
  ringOuter: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 2,
    borderColor: '#00e5ff',
    position: 'absolute',
  },
  ringInner: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#00e5ff',
    opacity: 0.6,
  },
  particlesContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
    height: 38,
    marginTop: 4,
  },
  particle: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
});

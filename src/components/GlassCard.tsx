import React from 'react';
import { StyleSheet, View, type ViewProps } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useExperienceStore } from '../preferences/experience';
import { colors } from '../theme';

export function GlassCard({ children, style, ...props }: ViewProps) {
  const glass = useExperienceStore(s => s.glassEnabled);
  const opacity = useExperienceStore(s => s.glassOpacity);
  const hasWallpaper = useExperienceStore(s => !!s.customWallpaperUri || s.wallpaperPreset !== 'default');

  const cardBg = !glass
    ? colors.surface
    : hasWallpaper
    ? `rgba(12, 22, 28, ${Math.max(0.4, Math.min(0.85, opacity * 0.72))})`
    : 'rgba(14, 25, 32, 0.75)';

  return (
    <View {...props} style={[s.card, { backgroundColor: cardBg }, style]}>
      {glass && (
        <LinearGradient
          pointerEvents="none"
          colors={['rgba(255, 255, 255, 0.12)', 'rgba(255, 255, 255, 0.02)', 'rgba(0, 0, 0, 0.25)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      )}
      {children}
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    overflow: 'hidden',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
});

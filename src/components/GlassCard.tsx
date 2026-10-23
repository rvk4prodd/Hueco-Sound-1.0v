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
    ? `rgba(16, 36, 35, ${Math.max(0.35, opacity * 0.75)})`
    : '#102423a8';

  return (
    <View {...props} style={[s.card, { backgroundColor: cardBg }, style]}>
      {glass && (
        <LinearGradient
          pointerEvents="none"
          colors={['#a7ffe822', '#1c4b4940', '#030d1566']}
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
    borderColor: '#9bffe02c',
  },
});

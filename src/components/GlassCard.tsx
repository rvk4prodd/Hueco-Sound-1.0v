import React from 'react';
import { StyleSheet, View, type ViewProps } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useExperienceStore } from '../preferences/experience';
import { colors } from '../theme';

export function GlassCard({ children, style, ...props }: ViewProps) {
  const glass = useExperienceStore(s => s.glassEnabled);
  const opacity = useExperienceStore(s => s.glassOpacity);

  const cardBg = !glass
    ? colors.surface
    : `rgba(12, 22, 28, ${Math.max(0.1, Math.min(1, opacity))})`;

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

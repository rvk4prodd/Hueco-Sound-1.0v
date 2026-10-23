import React from 'react';
import { StyleSheet, View, type ViewProps } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useExperienceStore } from '../preferences/experience';
import { colors } from '../theme';

export function GlassCard({ children, style, ...props }: ViewProps) {
  const glass = useExperienceStore(s => s.glassEnabled);
  return <View {...props} style={[s.card, !glass && { backgroundColor: colors.surface }, style]}>
    {glass && <LinearGradient pointerEvents="none" colors={['#a7ffe81c', '#1c4b4938', '#030d1566']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />}
    {children}
  </View>;
}
const s = StyleSheet.create({ card: { overflow: 'hidden', borderRadius: 22, backgroundColor: '#102423a8', borderWidth: 1, borderColor: '#9bffe02c' } });

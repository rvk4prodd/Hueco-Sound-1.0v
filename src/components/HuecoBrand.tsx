import React from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { useExperienceStore } from '../preferences/experience';

export function HuecoLogo({ width = 230 }: { width?: number }) {
  return <Image accessibilityLabel="Hueco Sound" source={require('../../assets/branding/hueco-logo.png')} style={{ width, height: width / 3 }} resizeMode="contain" />;
}
/** The original sheet stays intact; clipping selects a character without duplicating bitmaps. */
export function CharacterSprite({ size = 110, variant = 0 }: { size?: number; variant?: 0 | 1 | 2 | 3 }) {
  const enabled = useExperienceStore(s => s.spritesEnabled);
  if (!enabled) return null;
  const x = variant % 2, y = Math.floor(variant / 2);
  return <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ width: size * 1.34, height: size, overflow: 'hidden' }}><Image source={require('../../assets/branding/hueco-sprites.png')} style={[styles.sheet, { width: size * 2.68, height: size * 2, left: -x * size * 1.34, top: -y * size }]} resizeMode="stretch" /></View>;
}
const styles = StyleSheet.create({ sheet: { position: 'absolute' } });

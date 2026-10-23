import React, { memo, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { coverColor } from '../theme';
export const Cover = memo(function Cover({ uri, size = 48, seed = '', radius = 8 }: { uri?: string; size?: number; seed?: string; radius?: number }) {
 const [failedUri, setFailedUri] = useState<string | null>(null);
 return <View style={[styles.cover, { width: size, height: size, borderRadius: radius, backgroundColor: coverColor(seed) }]}>
 {uri && uri !== failedUri ? <Image source={{ uri }} style={StyleSheet.absoluteFill} onError={() => setFailedUri(uri)} accessibilityIgnoresInvertColors /> : <Ionicons name="musical-notes" size={Math.max(20, size * 0.28)} color="#dcebd2" />}
 </View>;
});
const styles = StyleSheet.create({ cover: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' } });

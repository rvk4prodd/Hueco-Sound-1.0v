import React, { useEffect } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useUIStore } from '../ui/useUIStore';
import { colors } from '../theme';
export function Toast() {
 const toast = useUIStore((s) => s.toast), dismiss = useUIStore((s) => s.dismissToast);
 useEffect(() => { if (!toast) return; const timer = setTimeout(dismiss, 4000); return () => clearTimeout(timer); }, [toast, dismiss]);
 if (!toast) return null;
 return <View pointerEvents="box-none" style={styles.wrap}><View style={styles.toast} accessibilityLiveRegion="polite"><Text style={styles.text}>{toast.message}</Text><Pressable accessibilityRole="button" accessibilityLabel="Dispensar mensagem" onPress={dismiss} style={styles.close}><Ionicons name="close" size={18} color={colors.background} /></Pressable></View></View>;
}
const styles = StyleSheet.create({ wrap: { position: 'absolute', left: 16, right: 16, bottom: 150, alignItems: 'center' }, toast: { backgroundColor: colors.accent, borderRadius: 12, flexDirection: 'row', alignItems: 'center', paddingLeft: 18, paddingVertical: 6, maxWidth: 520 }, text: { color: colors.background, fontSize: 13, fontWeight: '600', flex: 1, lineHeight: 19 }, close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' } });

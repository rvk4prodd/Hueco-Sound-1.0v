import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { TabType } from '../types';
import { colors } from '../theme';
const tabs: { key: TabType; label: string; icon: keyof typeof Ionicons.glyphMap; active: keyof typeof Ionicons.glyphMap }[] = [{ key: 'home', label: 'Início', icon: 'home-outline', active: 'home' }, { key: 'search', label: 'Buscar', icon: 'search-outline', active: 'search' }, { key: 'library', label: 'Biblioteca', icon: 'albums-outline', active: 'albums' }];
export function BottomNav({ currentTab, onTabChange }: { currentTab: TabType; onTabChange: (tab: TabType) => void }) {
 const insets = useSafeAreaInsets();
 return <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 8) }]}>{tabs.map((tab) => <Pressable key={tab.key} accessibilityRole="tab" accessibilityState={{ selected: currentTab === tab.key }} accessibilityLabel={tab.label} onPress={() => onTabChange(tab.key)} style={styles.tab}><Ionicons name={currentTab === tab.key ? tab.active : tab.icon} size={24} color={currentTab === tab.key ? colors.accent : colors.muted} /><Text style={[styles.label, currentTab === tab.key && { color: colors.text }]}>{tab.label}</Text></Pressable>)}</View>;
}
const styles = StyleSheet.create({ bar: { flexDirection: 'row', backgroundColor: colors.background, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }, tab: { flex: 1, alignItems: 'center', gap: 5, minHeight: 48 }, label: { color: colors.muted, fontSize: 10, fontWeight: '600' } });

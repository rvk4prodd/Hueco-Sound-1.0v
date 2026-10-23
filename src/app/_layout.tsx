import React, { useEffect } from 'react';
import { ActivityIndicator, View, StyleSheet, Platform } from 'react-native';
import { Stack, router, usePathname } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { usePlayerStore } from '../player/usePlayerStore';
import { useDeviceLibraryStore } from '../library/useDeviceLibraryStore';
import { useUIStore } from '../ui/useUIStore';
import { MiniPlayer } from '../components/MiniPlayer';
import { BottomNav } from '../components/BottomNav';
import { FullscreenPlayer } from '../components/FullscreenPlayer';
import { TrackActionsSheet } from '../components/TrackActionsSheet';
import { Toast } from '../components/Toast';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { colors } from '../theme';
import type { TabType } from '../types';
import { initializeAccount } from '../account/useAccountStore';
import { useExperienceStore } from '../preferences/experience';
import { audioManager } from '../player/audioManager';
export default function RootLayout() {
 const path = usePathname(), hydrated = usePlayerStore((s) => s.hydrated), reducedMotion = usePlayerStore((s) => s.reducedMotion);
 const transition = useExperienceStore(s => s.audioTransition), seconds = useExperienceStore(s => s.transitionSeconds), curve = useExperienceStore(s => s.fadeCurve), motion = useExperienceStore(s => s.visualTransition);
 useEffect(() => { audioManager.configureTransition(transition, seconds, curve); }, [transition, seconds, curve]);
 useEffect(() => {
  void initializeAccount().catch(() => useUIStore.getState().notify('Não foi possível restaurar sua conta. Entre novamente nas configurações.'));
  void (async () => { if (Platform.OS !== 'web') { try { await useDeviceLibraryStore.getState().loadSavedData(); } catch { useUIStore.getState().notify('Não foi possível carregar os arquivos do aparelho.'); } } await usePlayerStore.getState().loadSavedData(); })();
 }, []);
 const active: TabType = path.startsWith('/search') ? 'search' : path === '/' ? 'home' : 'library';
 const navigate = (tab: TabType) => { router.navigate(tab === 'home' ? '/' : tab === 'search' ? '/search' : '/library'); };
 return <SafeAreaProvider><ErrorBoundary><SafeAreaView style={styles.root} edges={['top']}><StatusBar style="light" />
 <View style={styles.content}><Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background }, animation: reducedMotion || motion === 'none' ? 'none' : motion === 'slide' ? 'slide_from_right' : 'fade', gestureEnabled: true }}>
 <Stack.Screen name="index" /><Stack.Screen name="search" /><Stack.Screen name="library" /><Stack.Screen name="playlist/[id]" /><Stack.Screen name="settings" /><Stack.Screen name="about" /><Stack.Screen name="collection" /><Stack.Screen name="+not-found" />
 </Stack>{!hydrated && <View style={styles.loading}><ActivityIndicator color={colors.accent} /></View>}</View>
 <MiniPlayer /><BottomNav currentTab={active} onTabChange={navigate} /><FullscreenPlayer /><TrackActionsSheet /><Toast />
 </SafeAreaView></ErrorBoundary></SafeAreaProvider>;
}
const styles = StyleSheet.create({ root: { flex: 1, backgroundColor: colors.background }, content: { flex: 1 }, loading: { ...StyleSheet.absoluteFill, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' } });

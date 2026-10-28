import React, { useEffect } from 'react';
import { ActivityIndicator, Image, View, StyleSheet, Platform, PermissionsAndroid } from 'react-native';
import { Stack, router, usePathname } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
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
import { useExperienceStore } from '../preferences/experience';
import { audioManager } from '../player/audioManager';
import { useAudioFXStore } from '../preferences/audioFX';

const PRESET_GRADIENTS: Record<string, [string, string, ...string[]]> = {
  neon: ['#120726', '#25083f', '#071523'],
  midnight: ['#070b19', '#0d193a', '#03060c'],
  cyberpunk: ['#041a1c', '#092d2b', '#030c14'],
  aurora: ['#041b23', '#15372c', '#080e21'],
  sunset: ['#2b1425', '#3a201a', '#0b1020'],
};

export default function RootLayout() {
  const path = usePathname(), hydrated = usePlayerStore((s) => s.hydrated), reducedMotion = usePlayerStore((s) => s.reducedMotion);
  const transition = useExperienceStore(s => s.audioTransition), seconds = useExperienceStore(s => s.transitionSeconds), curve = useExperienceStore(s => s.fadeCurve), motion = useExperienceStore(s => s.visualTransition);
  const wallpaperPreset = useExperienceStore(s => s.wallpaperPreset);
  const customWallpaperUri = useExperienceStore(s => s.customWallpaperUri);
  const glassBlur = useExperienceStore(s => s.glassBlurIntensity);
  const fx = useAudioFXStore(s => s.audioFX), slowed = useAudioFXStore(s => s.slowedReverb);
  const rate = usePlayerStore(s => s.playbackRate);
  const normalization = useExperienceStore(s => s.normalizationMode);
  useEffect(() => {
    const available = audioManager.configureStudio({
      enabled: fx.enabled, eq: fx.bands.map(band => band.gainDb),
      compressor: fx.compressorEnabled, threshold: fx.compressorThreshold, ratio: fx.compressorRatio,
      width: fx.stereoWidth / 100, reverb: slowed.enabled ? slowed.reverbLevel : 0,
      speed: slowed.enabled ? slowed.speed : rate, linked: slowed.enabled && slowed.isPitchLinked,
      pitch: slowed.enabled && !slowed.isPitchLinked ? slowed.pitchSemitones : 0,
    });
    audioManager.setNormalization(normalization);
    if (!available && (fx.enabled || slowed.enabled)) useUIStore.getState().notify('Os efeitos de áudio precisam do novo APK com o motor DSP.');
  }, [fx, slowed, rate, normalization]);

  useEffect(() => { audioManager.configureTransition(transition, seconds, curve); }, [transition, seconds, curve]);
  useEffect(() => {
    void (async () => {
      if (Platform.OS === 'android' && typeof Platform.Version === 'number' && Platform.Version >= 33) {
        try {
          await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
        } catch {
          // ignore if denied or unavailable
        }
      }
      if (Platform.OS !== 'web') {
        try { await useDeviceLibraryStore.getState().loadSavedData(); }
        catch { useUIStore.getState().notify('Não foi possível carregar os arquivos do aparelho.'); }
      }
      await usePlayerStore.getState().loadSavedData();
    })();
  }, []);

  const active: TabType = path.startsWith('/search') ? 'search' : path === '/' ? 'home' : 'library';
  const navigate = (tab: TabType) => { router.navigate(tab === 'home' ? '/' : tab === 'search' ? '/search' : '/library'); };

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <SafeAreaView style={styles.root} edges={['top']}>
          <StatusBar style="light" />

          {/* Background Wallpaper with Glass Effect */}
          {customWallpaperUri ? (
            <View pointerEvents="none" style={StyleSheet.absoluteFill}>
              <Image source={{ uri: customWallpaperUri }} style={[StyleSheet.absoluteFill, { opacity: .65 }]} blurRadius={glassBlur / 5} resizeMode="cover" />
              <View style={[StyleSheet.absoluteFill, { backgroundColor: `rgba(6, 12, 16, ${Math.max(0.2, 0.65 - (glassBlur / 100) * 0.4)})` }]} />
            </View>
          ) : wallpaperPreset !== 'default' && PRESET_GRADIENTS[wallpaperPreset] ? (
            <LinearGradient pointerEvents="none" colors={PRESET_GRADIENTS[wallpaperPreset]} style={StyleSheet.absoluteFill} />
          ) : (
            <LinearGradient pointerEvents="none" colors={['#080e14', '#0d1820', '#060a0e']} style={StyleSheet.absoluteFill} />
          )}

          <View style={styles.content}>
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: 'transparent' },
                animation: reducedMotion || motion === 'none' ? 'none' : motion === 'slide' ? 'slide_from_right' : 'fade',
                gestureEnabled: true,
              }}
            >
              <Stack.Screen name="index" />
              <Stack.Screen name="search" />
              <Stack.Screen name="library" />
              <Stack.Screen name="playlist/[id]" />
              <Stack.Screen name="settings" />
              <Stack.Screen name="about" />
              <Stack.Screen name="collection" />
              <Stack.Screen name="+not-found" />
            </Stack>
            {!hydrated && <View style={styles.loading}><ActivityIndicator color={colors.accent} /></View>}
          </View>

          <MiniPlayer />
          <BottomNav currentTab={active} onTabChange={navigate} />
          <FullscreenPlayer />
          <TrackActionsSheet />
          <Toast />
        </SafeAreaView>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#060a0e' },
  content: { flex: 1 },
  loading: { ...StyleSheet.absoluteFill, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' },
});

import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { usePlayerStore } from '../player/usePlayerStore';
import { colors, coverColor, themedStyles, useHuecoTheme } from '../theme';
import { Cover } from './Cover';
import { GlassCard } from './GlassCard';
function MiniProgress() { const progress = usePlayerStore((s) => s.durationMs > 0 ? Math.max(0, Math.min(s.positionMs / s.durationMs, 1)) : 0); return <View style={styles.progress}><View style={[styles.fill, { width: `${progress * 100}%` }]} /></View>; }
export function MiniPlayer() {
 useHuecoTheme();
 const track = usePlayerStore((s) => s.currentTrack), playing = usePlayerStore((s) => s.isPlaying), loading = usePlayerStore((s) => s.isLoading), error = usePlayerStore((s) => s.error);
 const reducedMotion = usePlayerStore((s) => s.reducedMotion), toggle = usePlayerStore((s) => s.togglePlayPause), next = usePlayerStore((s) => s.nextTrack), open = usePlayerStore((s) => s.setIsFullscreenOpen);
 const opacity = useState(() => new Animated.Value(0))[0]; const visible = Boolean(track);
 useEffect(() => { Animated.timing(opacity, { toValue: visible ? 1 : 0, duration: reducedMotion ? 0 : 220, useNativeDriver: true }).start(); }, [opacity, visible, reducedMotion]);
 if (!track) return null;
 return <Animated.View style={[styles.outer, { opacity }]}><GlassCard style={[styles.inner, { borderLeftWidth: 3, borderLeftColor: coverColor(track.id) }]}>
 <Pressable accessibilityRole="button" accessibilityLabel={`Abrir player: ${track.title}`} onPress={() => open(true)} style={styles.main}><Cover uri={track.coverUrl} seed={track.id} size={42} radius={5} /><View style={styles.info}><Text numberOfLines={1} style={styles.title}>{track.title}</Text><Text numberOfLines={1} style={[styles.artist, error && { color: colors.danger }]}>{error ? 'Falha ao tocar • toque para tentar' : track.artists}</Text></View></Pressable>
 <Pressable accessibilityRole="button" accessibilityLabel={playing ? 'Pausar' : 'Reproduzir'} disabled={loading} onPress={() => void toggle()} style={styles.button}>{loading ? <ActivityIndicator color={colors.text} size="small" /> : <Ionicons name={playing ? 'pause' : 'play'} size={27} color={colors.text} />}</Pressable>
 <Pressable accessibilityRole="button" accessibilityLabel="Próxima música" onPress={() => void next()} style={styles.button}><Ionicons name="play-skip-forward" size={22} color={colors.text} /></Pressable><MiniProgress /></GlassCard></Animated.View>;
}
const styles = themedStyles(() => ({ outer: { paddingHorizontal: 8, paddingTop: 6, paddingBottom: 6, backgroundColor: 'transparent' }, inner: { flexDirection: 'row', alignItems: 'center', padding: 8, borderRadius: 10, overflow: 'hidden', minHeight: 62 }, main: { flex: 1, flexDirection: 'row', alignItems: 'center', minWidth: 0 }, info: { flex: 1, marginLeft: 10 }, title: { color: colors.text, fontSize: 13, fontWeight: '700' }, artist: { color: '#d5dfce', fontSize: 11, marginTop: 4 }, button: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }, progress: { position: 'absolute', bottom: 0, left: 8, right: 8, height: 2, backgroundColor: '#ffffff20' }, fill: { height: 2, backgroundColor: colors.accent } }));

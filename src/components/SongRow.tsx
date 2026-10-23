import React, { memo } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Track } from '../types';
import { usePlayerStore } from '../player/usePlayerStore';
import { useUIStore } from '../ui/useUIStore';
import { colors } from '../theme';
import { Cover } from './Cover';
interface Props { track: Track; onPress?: () => void; playlistId?: string; index?: number; rightAccessory?: React.ReactNode; onMore?: () => void; }
export const SongRow = memo(function SongRow({ track, onPress, playlistId, rightAccessory, onMore }: Props) {
 const isCurrent = usePlayerStore((s) => s.currentTrack?.id === track.id);
 const playing = usePlayerStore((s) => s.currentTrack?.id === track.id && s.isPlaying);
 const liked = usePlayerStore((s) => s.likedTrackIds.includes(track.id));
 const play = usePlayerStore((s) => s.playTrack), like = usePlayerStore((s) => s.toggleLike);
 const actions = useUIStore((s) => s.openTrackActions);
 return <View style={[styles.row, isCurrent && styles.current]}>
 <Pressable accessibilityRole="button" accessibilityLabel={`Reproduzir ${track.title}, ${track.artists}`} onPress={onPress ?? (() => void play(track))}
 onLongPress={() => actions(track, playlistId)} style={({ pressed }) => [styles.main, pressed && { opacity: 0.65 }]}>
 <Cover uri={track.coverUrl} seed={track.id} size={48} radius={6} /><View style={styles.info}>
 <Text numberOfLines={1} style={[styles.title, isCurrent && { color: colors.accent }]}>{track.title}</Text><View style={styles.subtitle}>
 {track.explicit && <Text style={styles.explicit}>E</Text>}{track.source === 'local' && <Ionicons name="arrow-down-circle" size={13} color={colors.accent} />}{track.source === 'soundcloud' && <Ionicons name="logo-soundcloud" size={13} color="#ff7700" />}
 <Text numberOfLines={1} style={styles.artist}>{track.artists}</Text></View></View>
 {playing && <Ionicons name="stats-chart" size={17} color={colors.accent} style={{ marginLeft: 8 }} />}</Pressable>
 {rightAccessory ?? <Pressable accessibilityRole="button" accessibilityLabel={liked ? `Descurtir ${track.title}` : `Curtir ${track.title}`} hitSlop={4} onPress={() => like(track)} style={styles.button}><Ionicons name={liked ? 'heart' : 'heart-outline'} size={20} color={liked ? colors.accent : colors.muted} /></Pressable>}
 <Pressable accessibilityRole="button" accessibilityLabel={`Opções de ${track.title}`} onPress={onMore ?? (() => actions(track, playlistId))} style={styles.button}><Ionicons name="ellipsis-vertical" size={20} color={colors.muted} /></Pressable>
 </View>;
});
const styles = StyleSheet.create({ row: { flexDirection: 'row', alignItems: 'center', minHeight: 72, paddingHorizontal: 16 }, current: { backgroundColor: '#64f4d410', borderLeftWidth: 2, borderLeftColor: colors.accent }, main: { flexDirection: 'row', alignItems: 'center', flex: 1, minWidth: 0, paddingVertical: 10 }, info: { flex: 1, marginLeft: 12 }, title: { color: colors.text, fontSize: 15, fontWeight: '600', marginBottom: 5 }, subtitle: { flexDirection: 'row', alignItems: 'center', gap: 5 }, artist: { color: colors.muted, fontSize: 12, flexShrink: 1 }, explicit: { fontSize: 8, color: colors.background, backgroundColor: colors.muted, borderRadius: 2, paddingHorizontal: 3, paddingVertical: 1 }, button: { minHeight: 44, width: 40, justifyContent: 'center', alignItems: 'center' } });

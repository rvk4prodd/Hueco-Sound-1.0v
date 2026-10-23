import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Slider from '@react-native-community/slider';
import { usePlayerStore } from '../player/usePlayerStore';
import { colors, formatTime } from '../theme';
export function PlayerProgress() {
 const position = usePlayerStore((s) => s.positionMs), duration = usePlayerStore((s) => s.durationMs), trackId = usePlayerStore((s) => s.currentTrack?.id);
 const seek = usePlayerStore((s) => s.seekTo), loading = usePlayerStore((s) => s.isLoading);
 const [drag, setDrag] = useState<{ id: string | undefined; value: number } | null>(null);
 const value = drag && drag.id === trackId ? drag.value : position;
 return <View style={styles.container}>
 <Slider accessibilityLabel="Posição da música" accessibilityValue={{ text: `${formatTime(value)} de ${formatTime(duration)}` }} minimumValue={0} maximumValue={Math.max(1, duration)} value={Math.max(0, Math.min(value, duration))} disabled={loading || duration <= 0}
 minimumTrackTintColor={colors.accent} maximumTrackTintColor="#ffffff30" thumbTintColor={colors.text}
 onSlidingStart={(v) => setDrag({ id: trackId, value: v })} onValueChange={(v) => setDrag({ id: trackId, value: v })}
 onSlidingComplete={(v) => { setDrag(null); if (usePlayerStore.getState().currentTrack?.id === trackId) void seek(v); }} style={styles.slider} />
 <View style={styles.times}><Text style={styles.time}>{formatTime(value)}</Text><Text style={styles.time}>−{formatTime(duration - value)}</Text></View>
 </View>;
}
const styles = StyleSheet.create({ container: { marginTop: 22 }, slider: { width: '100%', height: 38 }, times: { flexDirection: 'row', justifyContent: 'space-between', marginTop: -3 }, time: { color: colors.muted, fontSize: 11, fontVariant: ['tabular-nums'] } });

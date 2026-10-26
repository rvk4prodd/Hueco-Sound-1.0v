import React, { useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme';
import { useAudioFXStore } from '../preferences/audioFX';
import { usePlayerStore } from '../player/usePlayerStore';
import { useUIStore } from '../ui/useUIStore';
import { GlassCard } from './GlassCard';
import { Cover } from './Cover';

interface Props {
  visible: boolean;
  onClose: () => void;
}

export function ListeningStatsModal({ visible, onClose }: Props) {
  const history = useAudioFXStore((s) => s.playHistory);
  const clearHistory = useAudioFXStore((s) => s.clearPlayHistory);
  const createPlaylist = usePlayerStore((s) => s.createPlaylist);
  const playTrack = usePlayerStore((s) => s.playTrack);
  const notify = useUIStore((s) => s.notify);

  const [timeFilter, setTimeFilter] = useState<'today' | 'week' | 'month' | 'all'>('week');

  const filteredHistory = useMemo(() => {
    const now = Date.now();
    const oneDay = 24 * 60 * 60 * 1000;
    return history.filter((item) => {
      const diff = now - item.playedAt;
      if (timeFilter === 'today') return diff <= oneDay;
      if (timeFilter === 'week') return diff <= 7 * oneDay;
      if (timeFilter === 'month') return diff <= 30 * oneDay;
      return true;
    });
  }, [history, timeFilter]);

  // Aggregate stats
  const totalSeconds = useMemo(
    () => filteredHistory.reduce((acc, it) => acc + (it.secondsPlayed || 0), 0),
    [filteredHistory]
  );

  const completedCount = useMemo(
    () => filteredHistory.filter((it) => it.completed).length,
    [filteredHistory]
  );

  const topArtists = useMemo(() => {
    const counts: Record<string, { count: number; seconds: number }> = {};
    for (const item of filteredHistory) {
      const art = item.artists.split(',')[0].trim() || 'Desconhecido';
      if (!counts[art]) counts[art] = { count: 0, seconds: 0 };
      counts[art].count += 1;
      counts[art].seconds += item.secondsPlayed || 0;
    }
    return Object.entries(counts)
      .map(([artist, d]) => ({ artist, ...d }))
      .sort((a, b) => b.seconds - a.seconds)
      .slice(0, 5);
  }, [filteredHistory]);

  const topTracks = useMemo(() => {
    const counts: Record<string, { count: number; track: typeof filteredHistory[0] }> = {};
    for (const item of filteredHistory) {
      if (!counts[item.trackId]) counts[item.trackId] = { count: 0, track: item };
      counts[item.trackId].count += 1;
    }
    return Object.values(counts)
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }, [filteredHistory]);

  const handleRecreatePlaylist = () => {
    if (filteredHistory.length === 0) {
      notify('Sem histórico para este período.');
      return;
    }
    const filterLabel =
      timeFilter === 'today'
        ? 'Hoje'
        : timeFilter === 'week'
        ? 'Últimos 7 dias'
        : timeFilter === 'month'
        ? 'Este Mês'
        : 'Todas as Épocas';

    const tracks = filteredHistory.map((h) => ({
      id: h.trackId,
      title: h.title,
      artists: h.artists,
      coverUrl: h.coverUrl,
      durationMs: h.durationMs,
    }));

    const name = `Time Machine: ${filterLabel}`;
    createPlaylist(name, tracks);
    notify(`Playlist "${name}" criada com sucesso!`);
    onClose();
  };

  const formatHours = (sec: number) => {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    return `${m} min`;
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={s.container}>
        {/* Header */}
        <View style={s.header}>
          <View>
            <Text style={s.title}>Listening Stats & Time Machine</Text>
            <Text style={s.subtitle}>Estatísticas detalhadas e resgate de playlists antigas</Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Fechar" onPress={onClose} style={s.closeBtn}>
            <Ionicons name="close" size={24} color={colors.text} />
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
          {/* Time Filter Chips */}
          <View style={s.filtersRow}>
            {(['today', 'week', 'month', 'all'] as const).map((f) => {
              const active = timeFilter === f;
              const labels = { today: 'Hoje', week: '7 Dias', month: '30 Dias', all: 'Histórico Completo' };
              return (
                <Pressable
                  key={f}
                  accessibilityRole="button"
                  onPress={() => setTimeFilter(f)}
                  style={[s.filterChip, active && s.filterChipActive]}
                >
                  <Text style={[s.filterChipText, active && s.filterChipTextActive]}>{labels[f]}</Text>
                </Pressable>
              );
            })}
          </View>

          {/* Key Summary Cards */}
          <View style={s.summaryRow}>
            <GlassCard style={s.summaryCard}>
              <Ionicons name="time-outline" size={22} color={colors.accent} />
              <Text style={s.summaryValue}>{formatHours(totalSeconds)}</Text>
              <Text style={s.summaryLabel}>Tempo Ouvido</Text>
            </GlassCard>

            <GlassCard style={s.summaryCard}>
              <Ionicons name="musical-notes-outline" size={22} color={colors.accent} />
              <Text style={s.summaryValue}>{filteredHistory.length}</Text>
              <Text style={s.summaryLabel}>Reproduções</Text>
            </GlassCard>

            <GlassCard style={s.summaryCard}>
              <Ionicons name="checkmark-done-circle-outline" size={22} color={colors.accent} />
              <Text style={s.summaryValue}>
                {filteredHistory.length > 0
                  ? `${Math.round((completedCount / filteredHistory.length) * 100)}%`
                  : '0%'}
              </Text>
              <Text style={s.summaryLabel}>Conclusão</Text>
            </GlassCard>
          </View>

          {/* Time Machine Action Banner */}
          <GlassCard style={s.timeMachineCard}>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name="hourglass-outline" size={18} color={colors.accent} />
                <Text style={s.cardTitle}>Music Time Machine</Text>
              </View>
              <Text style={s.cardDesc}>
                Reviva exatamente o que você ouviu nesse período salvando como playlist.
              </Text>
            </View>
            <Pressable accessibilityRole="button" onPress={handleRecreatePlaylist} style={s.recreateBtn}>
              <Text style={s.recreateBtnText}>Recriar Playlist</Text>
            </Pressable>
          </GlassCard>

          {/* Top Artists */}
          <Text style={s.sectionTitle}>ARTISTAS MAIS OUVIDOS</Text>
          <GlassCard style={s.card}>
            {topArtists.length === 0 ? (
              <Text style={s.emptyText}>Nenhuma reprodução registrada para este período.</Text>
            ) : (
              topArtists.map((art, idx) => (
                <View key={art.artist} style={s.rankRow}>
                  <Text style={s.rankNum}>#{idx + 1}</Text>
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={s.rankName}>{art.artist}</Text>
                    <Text style={s.rankSub}>{art.count} músicas • {formatHours(art.seconds)}</Text>
                  </View>
                </View>
              ))
            )}
          </GlassCard>

          {/* Top Tracks */}
          <Text style={s.sectionTitle}>MÚSICAS MAIS TOCADAS</Text>
          <GlassCard style={s.card}>
            {topTracks.length === 0 ? (
              <Text style={s.emptyText}>Nenhuma música registrada para este período.</Text>
            ) : (
              topTracks.map((item, idx) => (
                <Pressable
                  key={`${item.track.trackId}-${idx}`}
                  accessibilityRole="button"
                  onPress={() => {
                    playTrack({
                      id: item.track.trackId,
                      title: item.track.title,
                      artists: item.track.artists,
                      coverUrl: item.track.coverUrl,
                      durationMs: item.track.durationMs,
                    });
                    onClose();
                  }}
                  style={s.rankRow}
                >
                  <Text style={s.rankNum}>#{idx + 1}</Text>
                  <Cover uri={item.track.coverUrl} seed={item.track.trackId} size={38} radius={6} />
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text numberOfLines={1} style={s.rankName}>{item.track.title}</Text>
                    <Text numberOfLines={1} style={s.rankSub}>{item.track.artists} • {item.count} vezes</Text>
                  </View>
                  <Ionicons name="play-circle-outline" size={24} color={colors.accent} />
                </Pressable>
              ))
            )}
          </GlassCard>

          {history.length > 0 && (
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                clearHistory();
                notify('Histórico de estatísticas limpo.');
              }}
              style={{ marginTop: 20, alignItems: 'center' }}
            >
              <Text style={{ color: colors.danger, fontSize: 12, fontWeight: '700' }}>
                Limpar dados do histórico de escuta
              </Text>
            </Pressable>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#070c12' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  title: { color: colors.text, fontSize: 20, fontWeight: '800' },
  subtitle: { color: colors.muted, fontSize: 12, marginTop: 2 },
  closeBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  scroll: { padding: 18, paddingBottom: 60 },
  filtersRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  filterChip: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  filterChipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  filterChipText: { color: colors.muted, fontSize: 11, fontWeight: '700' },
  filterChipTextActive: { color: '#000' },
  summaryRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  summaryCard: { flex: 1, padding: 14, alignItems: 'center', gap: 4 },
  summaryValue: { color: colors.text, fontSize: 17, fontWeight: '800', marginTop: 4 },
  summaryLabel: { color: colors.muted, fontSize: 10, fontWeight: '600' },
  timeMachineCard: {
    padding: 16,
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  cardTitle: { color: colors.text, fontSize: 14, fontWeight: '800' },
  cardDesc: { color: colors.muted, fontSize: 11, marginTop: 3 },
  recreateBtn: {
    backgroundColor: colors.accent,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
  },
  recreateBtnText: { color: '#000', fontSize: 11, fontWeight: '800' },
  sectionTitle: { color: colors.muted, fontSize: 11, fontWeight: '800', letterSpacing: 1.5, marginTop: 10, marginBottom: 10, paddingLeft: 4 },
  card: { padding: 14, marginBottom: 14, gap: 12 },
  rankRow: { flexDirection: 'row', alignItems: 'center' },
  rankNum: { color: colors.accent, fontSize: 14, fontWeight: '900', width: 28 },
  rankName: { color: colors.text, fontSize: 13, fontWeight: '700' },
  rankSub: { color: colors.muted, fontSize: 11, marginTop: 2 },
  emptyText: { color: colors.muted, fontSize: 12, textAlign: 'center', paddingVertical: 10 },
});

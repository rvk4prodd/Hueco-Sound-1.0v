import React, { useEffect, useRef, useState } from 'react';
import {
  Image,
  Modal,
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  FlatList,
  useWindowDimensions,
  GestureResponderEvent,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePlayerStore } from '../player/usePlayerStore';
import { useUIStore } from '../ui/useUIStore';
import { colors, coverColor, themedStyles, useHuecoTheme } from '../theme';
import type { LyricLine } from '../types';
import { Cover } from './Cover';
import { SongRow } from './SongRow';
import { PlayerProgress } from './PlayerProgress';
import { MotionView } from './MotionView';
import { GlassCard } from './GlassCard';
import { PlaybackWaves } from './PlaybackWaves';
import { CharacterSprite } from './HuecoBrand';
import { useExperienceStore } from '../preferences/experience';
import { DJToolsBar } from './DJToolsBar';
import { AudioFXRackModal } from './AudioFXRackModal';
import { SlowedReverbModal } from './SlowedReverbModal';
import { LyricsFXStudioModal } from './LyricsFXStudioModal';
import { ListeningStatsModal } from './ListeningStatsModal';

type Page = 'music' | 'lyrics' | 'queue';
type IconName = keyof typeof Ionicons.glyphMap;

function IconButton({
  icon,
  label,
  onPress,
  active,
  disabled,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: Boolean(active), disabled: Boolean(disabled) }}
      onPress={onPress}
      disabled={disabled}
      style={[styles.iconButton, disabled && { opacity: 0.35 }]}
    >
      <Ionicons name={icon} size={25} color={active ? colors.accent : colors.text} />
    </Pressable>
  );
}

function PlaybackControls() {
  const playing = usePlayerStore(s => s.isPlaying);
  const loading = usePlayerStore(s => s.isLoading);
  const shuffle = usePlayerStore(s => s.shuffle);
  const repeat = usePlayerStore(s => s.repeatMode);
  const toggle = usePlayerStore(s => s.togglePlayPause);
  const next = usePlayerStore(s => s.nextTrack);
  const previous = usePlayerStore(s => s.prevTrack);
  const toggleShuffle = usePlayerStore(s => s.toggleShuffle);
  const toggleRepeat = usePlayerStore(s => s.toggleRepeat);

  return (
    <View style={styles.controls}>
      <IconButton
        icon="shuffle"
        label={shuffle ? 'Desativar aleatório' : 'Ativar aleatório'}
        active={shuffle}
        onPress={toggleShuffle}
      />
      <IconButton icon="play-skip-back" label="Música anterior" onPress={() => void previous()} />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={playing ? 'Pausar' : 'Reproduzir'}
        disabled={loading}
        onPress={() => void toggle()}
        style={styles.playButton}
      >
        {loading ? (
          <ActivityIndicator color={colors.background} />
        ) : (
          <Ionicons name={playing ? 'pause' : 'play'} size={32} color={colors.background} />
        )}
      </Pressable>
      <IconButton icon="play-skip-forward" label="Próxima música" onPress={() => void next()} />
      <View>
        <IconButton
          icon="repeat"
          label={`Repetição: ${repeat === 'one' ? 'uma música' : repeat === 'all' ? 'fila' : 'desativada'}. Alterar`}
          active={repeat !== 'off'}
          onPress={toggleRepeat}
        />
        {repeat === 'one' && (
          <Text pointerEvents="none" style={styles.repeatOne}>
            1
          </Text>
        )}
      </View>
    </View>
  );
}

function LyricsView({ onOpenStudio }: { onOpenStudio: () => void }) {
  const lyrics = usePlayerStore(s => s.lyrics);
  const loading = usePlayerStore(s => s.isLyricsLoading);
  const position = usePlayerStore(s => s.positionMs);
  const offset = usePlayerStore(s => s.lyricsOffsetMs);
  const setOffset = usePlayerStore(s => s.setLyricsOffsetMs);
  const seek = usePlayerStore(s => s.seekTo);

  const fxStyle = useExperienceStore(s => s.lyricsFXStyle);
  const fontSize = useExperienceStore(s => s.lyricsFontSize);
  const glow = useExperienceStore(s => s.lyricsGlow);

  const list = useRef<FlatList<LyricLine>>(null);
  const [follow, setFollow] = useState(true);
  const synced = lyrics.some(l => l.synced !== false);

  let active = -1;
  if (synced) {
    for (let i = 0; i < lyrics.length; i++) {
      if (lyrics[i].startTimeMs <= position + offset) active = i;
      else break;
    }
  }

  useEffect(() => {
    if (follow && active >= 0) {
      list.current?.scrollToIndex({
        index: active,
        animated: !usePlayerStore.getState().reducedMotion,
        viewPosition: 0.35,
      });
    }
  }, [active, follow]);

  const sizePixels = fontSize === 'small' ? 22 : fontSize === 'large' ? 32 : fontSize === 'xlarge' ? 38 : 27;

  if (loading) {
    return (
      <View style={styles.empty}>
        <ActivityIndicator color={colors.accent} />
        <Text style={styles.muted}>Buscando a letra…</Text>
      </View>
    );
  }

  if (!lyrics.length) {
    return (
      <View style={styles.empty}>
        <Ionicons name="mic-outline" size={42} color={colors.muted} />
        <Text style={styles.sectionTitle}>Sem letra por enquanto</Text>
        <Text style={styles.emptyText}>Esta faixa ainda não tem uma letra disponível.</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.lyricTools}>
        <Text style={styles.muted}>
          {synced ? 'Toque em um verso para avançar' : 'Letra sem sincronização'}
        </Text>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          <Pressable accessibilityRole="button" onPress={onOpenStudio} style={styles.chip}>
            <Text style={styles.chipText}>✨ FX Studio</Text>
          </Pressable>
          {synced && (
            <Pressable
              accessibilityRole="button"
              onPress={() => setFollow(v => !v)}
              style={styles.chip}
            >
              <Text style={styles.chipText}>{follow ? 'Acompanhando' : 'Acompanhar'}</Text>
            </Pressable>
          )}
        </View>
      </View>

      {synced && (
        <View style={styles.offset}>
          <IconButton
            icon="remove"
            label="Atrasar letra meio segundo"
            onPress={() => setOffset(offset - 500)}
          />
          <Text style={styles.muted}>Ajuste da letra: {(offset / 1000).toFixed(1)} s</Text>
          <IconButton
            icon="add"
            label="Adiantar letra meio segundo"
            onPress={() => setOffset(offset + 500)}
          />
        </View>
      )}

      <FlatList
        ref={list}
        data={lyrics}
        keyExtractor={(_, i) => String(i)}
        contentContainerStyle={styles.lyricsList}
        extraData={active}
        onScrollBeginDrag={() => setFollow(false)}
        onScrollToIndexFailed={({ index, averageItemLength }) =>
          list.current?.scrollToOffset({ offset: index * averageItemLength, animated: false })
        }
        renderItem={({ item, index }) => {
          const isActive = index === active;
          const isPassed = index < active;

          const activeStyle = isActive
            ? fxStyle === 'neon_amv'
              ? {
                  color: '#00e5ff',
                  textShadowColor: glow ? '#00e5ff' : 'transparent',
                  textShadowRadius: 14,
                  fontWeight: '900' as const,
                }
              : fxStyle === 'kinetic_zoom'
              ? {
                  color: '#ffffff',
                  fontWeight: '900' as const,
                  letterSpacing: 1.2,
                }
              : fxStyle === 'subtle_shake'
              ? {
                  color: '#f59e0b',
                  fontWeight: '800' as const,
                  fontStyle: 'italic' as const,
                }
              : fxStyle === 'karaoke_fill'
              ? {
                  color: '#10b981',
                  fontWeight: '800' as const,
                }
              : {
                  color: colors.accent,
                  textShadowColor: glow ? colors.accent : 'transparent',
                  textShadowRadius: 8,
                }
            : null;

          return (
            <Pressable
              accessibilityRole={synced ? 'button' : 'text'}
              accessibilityLabel={item.words}
              disabled={!synced}
              onPress={() => {
                void seek(Math.max(0, item.startTimeMs - offset));
                setFollow(true);
              }}
              style={styles.lyricRow}
            >
              <Text
                style={[
                  styles.lyric,
                  { fontSize: sizePixels, lineHeight: sizePixels * 1.35 },
                  isPassed && { color: '#dce4d7' },
                  activeStyle,
                ]}
              >
                {item.words || '♪'}
              </Text>
            </Pressable>
          );
        }}
      />
    </View>
  );
}

function QueueView() {
  const queue = usePlayerStore(s => s.queue);
  const index = usePlayerStore(s => s.currentIndex);
  const play = usePlayerStore(s => s.playTrack);
  const remove = usePlayerStore(s => s.removeFromQueue);
  const move = usePlayerStore(s => s.moveQueueTrack);
  const clear = usePlayerStore(s => s.clearQueue);

  return (
    <FlatList
      data={queue}
      keyExtractor={(t, i) => t.id + ':' + i}
      contentContainerStyle={{ paddingBottom: 24 }}
      extraData={index}
      ListHeaderComponent={
        <View style={styles.queueHeader}>
          <View>
            <Text style={styles.sectionTitle}>Sua fila</Text>
            <Text style={styles.muted}>
              {queue.length} músicas • {Math.max(0, queue.length - index - 1)} a seguir
            </Text>
          </View>
          <Pressable accessibilityRole="button" onPress={clear} style={styles.chip}>
            <Text style={styles.chipText}>Limpar próximas</Text>
          </Pressable>
        </View>
      }
      ListEmptyComponent={<Text style={styles.emptyText}>Adicione músicas pelo menu ⋮ de qualquer faixa.</Text>}
      renderItem={({ item, index: i }) => (
        <View>
          <SongRow
            track={item}
            onPress={() => void play(item, queue)}
            rightAccessory={
              <View style={styles.queueButtons}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Mover ${item.title} para cima`}
                  disabled={i === 0}
                  onPress={() => move(i, i - 1)}
                  style={[styles.smallButton, i === 0 && { opacity: 0.25 }]}
                >
                  <Ionicons name="arrow-up" color={colors.text} size={18} />
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Mover ${item.title} para baixo`}
                  disabled={i === queue.length - 1}
                  onPress={() => move(i, i + 1)}
                  style={[styles.smallButton, i === queue.length - 1 && { opacity: 0.25 }]}
                >
                  <Ionicons name="arrow-down" color={colors.text} size={18} />
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Remover ${item.title} da fila`}
                  disabled={i === index}
                  onPress={() => remove(i)}
                  style={[styles.smallButton, i === index && { opacity: 0.25 }]}
                >
                  <Ionicons name="close" color={colors.muted} size={20} />
                </Pressable>
              </View>
            }
          />
          {i === index && <Text style={styles.nowLabel}>TOCANDO AGORA</Text>}
        </View>
      )}
    />
  );
}

export function FullscreenPlayer() {
 useHuecoTheme();
  const glass = useExperienceStore(s => s.glassEnabled);
  const motion = useExperienceStore(s => s.visualTransition);
  const customWallpaperUri = useExperienceStore(s => s.customWallpaperUri);
  const gesturesConfig = useExperienceStore(s => s.gestures);

  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();

  const track = usePlayerStore(s => s.currentTrack);
  const open = usePlayerStore(s => s.isFullscreenOpen);
  const reducedMotion = usePlayerStore(s => s.reducedMotion);
  const error = usePlayerStore(s => s.error);
  const positionMs = usePlayerStore(s => s.positionMs);
  const liked = usePlayerStore(s => (s.currentTrack ? s.likedTrackIds.includes(s.currentTrack.id) : false));

  const close = usePlayerStore(s => s.setIsFullscreenOpen);
  const like = usePlayerStore(s => s.toggleLike);
  const retry = usePlayerStore(s => s.retryPlayback);
  const seekTo = usePlayerStore(s => s.seekTo);
  const nextTrack = usePlayerStore(s => s.nextTrack);
  const prevTrack = usePlayerStore(s => s.prevTrack);

  const sleep = usePlayerStore(s => s.sleepTimerEndAt);
  const sleepEnd = usePlayerStore(s => s.sleepAtEndOfTrack);
  const setSleep = usePlayerStore(s => s.setSleepTimer);
  const setSleepEnd = usePlayerStore(s => s.setSleepAtEndOfTrack);
  const actions = useUIStore(s => s.openTrackActions);

  const [page, setPage] = useState<Page>('music');
  const [showSleep, setShowSleep] = useState(false);

  // Studio Modals
  const [showAudioFX, setShowAudioFX] = useState(false);
  const [showSlowedReverb, setShowSlowedReverb] = useState(false);
  const [showLyricsFX, setShowLyricsFX] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [showTools, setShowTools] = useState(false);

  // Gesture handling refs
  const touchStartX = useRef(0);
  const lastTapTime = useRef(0);

  const coverSize = Math.max(180, Math.min(width - 56, height * 0.38, 360));

  if (!track) return null;

  const goSettings = () => {
    close(false);
    router.push('/settings');
  };

  const handleTouchStart = (e: GestureResponderEvent) => {
    touchStartX.current = e.nativeEvent.pageX;
  };

  const handleTouchEnd = (e: GestureResponderEvent) => {
    const endX = e.nativeEvent.pageX;
    const deltaX = endX - touchStartX.current;
    const now = Date.now();

    // Check double-tap seek
    if (now - lastTapTime.current < 320 && Math.abs(deltaX) < 20) {
      const seekSec = gesturesConfig.doubleTapSeekSeconds || 10;
      if (endX < width / 2) {
        // Tap left -> seek backwards
        void seekTo(Math.max(0, positionMs - seekSec * 1000));
      } else {
        // Tap right -> seek forwards
        void seekTo(positionMs + seekSec * 1000);
      }
      lastTapTime.current = 0;
      return;
    }
    lastTapTime.current = now;

    // Check horizontal swipe
    if (gesturesConfig.swipeToChangeTrack && Math.abs(deltaX) > 60) {
      if (deltaX < 0) {
        // Swiped left -> next track
        void nextTrack();
      } else {
        // Swiped right -> prev track
        void prevTrack();
      }
    }
  };

  return (
    <Modal
      visible={open}
      animationType={
        reducedMotion || motion === 'none' ? 'none' : motion === 'slide' ? 'slide' : 'fade'
      }
      presentationStyle="fullScreen"
      onRequestClose={() => {
        if (showSleep) setShowSleep(false);
        else if (page !== 'music') setPage('music');
        else close(false);
      }}
      statusBarTranslucent
    >
      <LinearGradient
        colors={[coverColor(track.id), 'rgba(6, 10, 14, 0.85)', '#060a0e']}
        locations={[0, 0.5, 1]}
        style={[
          styles.container,
          { paddingTop: insets.top, paddingBottom: Math.max(insets.bottom, 12) },
        ]}
      >
        {customWallpaperUri && (
          <Image
            pointerEvents="none"
            source={{ uri: customWallpaperUri }}
            style={[StyleSheet.absoluteFill, { opacity: 0.65 }]}
            resizeMode="cover"
          />
        )}
        {glass && !!track.coverUrl && (
          <Image
            pointerEvents="none"
            source={{ uri: track.coverUrl }}
            blurRadius={35}
            style={[StyleSheet.absoluteFill, { opacity: 0.35 }]}
            resizeMode="cover"
          />
        )}

        {/* Top Header */}
        <View style={styles.header}>
          <IconButton icon="chevron-down" label="Fechar player" onPress={() => close(false)} />
          <View style={styles.headerTitle}>
            <Text style={styles.eyebrow}>TOCANDO DA SUA BIBLIOTECA</Text>
            <Text numberOfLines={1} style={styles.headerSubtitle}>
              {track.albumTitle || track.title}
            </Text>
          </View>
          <IconButton
            icon="ellipsis-horizontal"
            label="Opções da música"
            onPress={() => actions(track)}
          />
        </View>

        {/* Navigation Tabs */}
        <View style={styles.pages}>
          {(
            [
              { id: 'music', text: 'Música' },
              { id: 'lyrics', text: 'Letra' },
              { id: 'queue', text: 'Fila' },
            ] as const
          ).map(tab => (
            <Pressable
              key={tab.id}
              accessibilityRole="tab"
              accessibilityState={{ selected: page === tab.id }}
              onPress={() => setPage(tab.id)}
              style={[styles.pageTab, page === tab.id && styles.pageActive]}
            >
              <Text style={[styles.pageText, page === tab.id && { color: colors.text }]}>
                {tab.text}
              </Text>
            </Pressable>
          ))}
        </View>

        <MotionView key={page} style={{ flex: 1 }}>
          {page === 'music' ? (
            <ScrollView
              contentContainerStyle={styles.scroll}
              showsVerticalScrollIndicator={false}
            >
              {/* Cover Art with Gesture Support */}
              <View
                onTouchStart={handleTouchStart}
                onTouchEnd={handleTouchEnd}
                style={styles.art}
              >
                <Cover uri={track.coverUrl} seed={track.id} size={coverSize} radius={14} />
              </View>

              {/* Title & Artist Row */}
              <View style={styles.trackRow}>
                <View style={{ flex: 1 }}>
                  <Text numberOfLines={2} style={styles.title}>
                    {track.title}
                  </Text>
                  <Text numberOfLines={1} style={styles.artist}>
                    {track.artists}
                  </Text>
                </View>
                <IconButton
                  icon={liked ? 'heart' : 'heart-outline'}
                  label={liked ? 'Remover das curtidas' : 'Curtir música'}
                  active={liked}
                  onPress={() => like(track)}
                />
              </View>

              {error && (
                <View style={styles.error}>
                  <Text style={styles.errorText}>{error}</Text>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => void retry()}
                    style={styles.chip}
                  >
                    <Text style={styles.chipText}>Tentar novamente</Text>
                  </Pressable>
                </View>
              )}

              {/* Progress & Controls */}
              <PlayerProgress />
              <PlaybackControls />
              <PlaybackWaves active={open && page === 'music'} />

              <Pressable accessibilityRole="button" accessibilityState={{ expanded: showTools }} onPress={() => setShowTools(!showTools)} style={[styles.chip, { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }]}>
                <Text style={styles.chipText}>Ferramentas de áudio</Text>
                <Ionicons name={showTools ? 'chevron-up' : 'chevron-down'} size={18} color={colors.muted} />
              </Pressable>
              {showTools && <View>
              <DJToolsBar />

              {/* Studio Quick Action Pills */}
              <View style={styles.studioPillsRow}>
                <Pressable
                  accessibilityRole="button"
                  style={styles.studioPill}
                  onPress={() => setShowAudioFX(true)}
                >
                  <Text style={styles.studioPillText}>Equalizador</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  style={styles.studioPill}
                  onPress={() => setShowSlowedReverb(true)}
                >
                  <Text style={styles.studioPillText}>Velocidade e reverb</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  style={styles.studioPill}
                  onPress={() => setShowLyricsFX(true)}
                >
                  <Text style={styles.studioPillText}>Estilo das letras</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  style={styles.studioPill}
                  onPress={() => setShowStats(true)}
                >
                  <Text style={styles.studioPillText}>Estatísticas</Text>
                </Pressable>
              </View>
              </View>}

              {/* Bottom Utility Bar */}
              <View style={styles.utility}>
                <IconButton
                  icon="timer-outline"
                  label="Temporizador para dormir"
                  active={Boolean(sleep || sleepEnd)}
                  onPress={() => setShowSleep(true)}
                />
                <IconButton
                  icon="options-outline"
                  label="Configurações de áudio e mixagem"
                  onPress={goSettings}
                />
                <IconButton
                  icon="mic-outline"
                  label="Letras sincronizadas"
                  onPress={() => setPage('lyrics')}
                />
                <IconButton
                  icon="list-outline"
                  label="Fila de reprodução"
                  onPress={() => setPage('queue')}
                />
              </View>

              {/* Lyrics teaser card */}
              <Pressable accessibilityRole="button" onPress={() => setPage('lyrics')}>
                <GlassCard style={{ marginTop: 14, padding: 16 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Ionicons name="mic" size={18} color={colors.accent} />
                        <Text style={styles.sectionTitle}>Letras</Text>
                      </View>
                      <Text style={styles.cardBody}>Acompanhe cada verso em tempo real com efeitos de AMV.</Text>
                      <Text style={styles.cardFooter}>EXPANDIR LETRA ↗</Text>
                    </View>
                    <CharacterSprite size={70} variant={1} />
                  </View>
                </GlassCard>
              </Pressable>
            </ScrollView>
          ) : page === 'lyrics' ? (
            <LyricsView onOpenStudio={() => setShowLyricsFX(true)} />
          ) : (
            <QueueView />
          )}
        </MotionView>

        {/* Sleep Timer Overlay */}
        {showSleep && (
          <View style={styles.sleepOverlay}>
            <Pressable
              accessibilityLabel="Fechar temporizador"
              style={StyleSheet.absoluteFill}
              onPress={() => setShowSleep(false)}
            />
            <View style={styles.sleepCard}>
              <Text style={styles.sectionTitle}>Uma pausa no seu tempo</Text>
              <Text style={styles.muted}>A música para automaticamente.</Text>
              <View style={styles.sleepOptions}>
                {[5, 10, 15, 30, 45, 60].map(minutes => (
                  <Pressable
                    key={minutes}
                    accessibilityRole="button"
                    onPress={() => {
                      setSleep(minutes);
                      setShowSleep(false);
                    }}
                    style={styles.sleepOption}
                  >
                    <Text style={styles.chipText}>{minutes} min</Text>
                  </Pressable>
                ))}
              </View>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setSleepEnd(true);
                  setShowSleep(false);
                }}
                style={styles.sleepOption}
              >
                <Text style={styles.chipText}>Ao terminar esta música</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setSleep(null);
                  setSleepEnd(false);
                  setShowSleep(false);
                }}
                style={styles.sleepOption}
              >
                <Text style={[styles.chipText, { color: colors.danger }]}>
                  Desativar temporizador
                </Text>
              </Pressable>
              <IconButton
                icon="close"
                label="Fechar temporizador"
                onPress={() => setShowSleep(false)}
              />
            </View>
          </View>
        )}

        {/* Modals */}
        <AudioFXRackModal visible={showAudioFX} onClose={() => setShowAudioFX(false)} />
        <SlowedReverbModal
          visible={showSlowedReverb}
          onClose={() => setShowSlowedReverb(false)}
        />
        <LyricsFXStudioModal visible={showLyricsFX} onClose={() => setShowLyricsFX(false)} />
        <ListeningStatsModal visible={showStats} onClose={() => setShowStats(false)} />
      </LinearGradient>
    </Modal>
  );
}

const styles = themedStyles(() => ({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    height: 54,
  },
  headerTitle: { flex: 1, alignItems: 'center' },
  eyebrow: { color: colors.muted, fontSize: 9, letterSpacing: 2, fontWeight: '700' },
  headerSubtitle: { color: colors.text, fontSize: 11, marginTop: 4, maxWidth: '90%' },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  pages: {
    flexDirection: 'row',
    alignSelf: 'center',
    backgroundColor: '#00000025',
    borderRadius: 24,
    padding: 3,
    marginBottom: 8,
  },
  pageTab: { paddingVertical: 8, paddingHorizontal: 20, borderRadius: 20 },
  pageActive: { backgroundColor: '#ffffff18' },
  pageText: { color: colors.muted, fontSize: 12, fontWeight: '600' },
  scroll: { paddingHorizontal: 24, paddingBottom: 24 },
  art: { alignItems: 'center', paddingTop: 10, paddingBottom: 18 },
  trackRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { color: colors.text, fontWeight: '800', fontSize: 22, letterSpacing: -0.6 },
  artist: { color: colors.muted, fontSize: 13, marginTop: 5 },
  controls: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
    marginBottom: 10,
  },
  playButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  repeatOne: {
    position: 'absolute',
    fontSize: 8,
    fontWeight: '800',
    color: colors.accent,
    left: 20,
    top: 17,
  },
  studioPillsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginTop: 10,
    marginBottom: 8,
  },
  studioPill: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderColor: 'rgba(255, 255, 255, 0.14)',
    borderWidth: 1,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
  },
  studioPillText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700',
  },
  utility: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  muted: { color: colors.muted, fontSize: 11 },
  sectionTitle: { color: colors.text, fontSize: 18, fontWeight: '800', marginBottom: 4 },
  cardBody: { color: '#cedcc5', fontSize: 13, marginTop: 8, lineHeight: 18 },
  cardFooter: {
    fontSize: 9,
    letterSpacing: 1.5,
    color: colors.accent,
    fontWeight: '800',
    marginTop: 16,
  },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32, gap: 16 },
  emptyText: { color: colors.muted, fontSize: 14, textAlign: 'center', lineHeight: 22 },
  lyricTools: {
    paddingHorizontal: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
  },
  offset: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  lyricsList: { paddingHorizontal: 24, paddingTop: 18, paddingBottom: 140 },
  lyricRow: { paddingVertical: 12 },
  lyric: {
    color: '#ffffff60',
    fontWeight: '800',
    letterSpacing: -0.6,
  },
  chip: {
    backgroundColor: colors.elevated,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  chipText: { color: colors.text, fontSize: 11, fontWeight: '600', textAlign: 'center' },
  queueHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
  },
  queueButtons: { flexDirection: 'row' },
  smallButton: { width: 32, height: 44, alignItems: 'center', justifyContent: 'center' },
  nowLabel: {
    fontSize: 8,
    letterSpacing: 2,
    color: colors.accent,
    marginLeft: 76,
    marginTop: -6,
    marginBottom: 6,
  },
  error: {
    backgroundColor: '#ff9b9514',
    padding: 14,
    borderRadius: 10,
    marginTop: 14,
    gap: 12,
  },
  errorText: { color: colors.danger, fontSize: 12, lineHeight: 19 },
  sleepOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#000000aa',
    justifyContent: 'flex-end',
  },
  sleepCard: {
    padding: 24,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    backgroundColor: colors.surface,
    alignItems: 'center',
    gap: 12,
  },
  sleepOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'center',
  },
  sleepOption: {
    backgroundColor: colors.elevated,
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderRadius: 20,
    marginTop: 4,
  },
}));

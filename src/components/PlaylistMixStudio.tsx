import React, { useMemo, useState, useRef, useCallback, useEffect } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { createAudioPlayer } from 'expo-audio';
import type { AudioPlayer } from 'expo-audio';
import { resolveAudioStream } from '../api/innertube';
import { calculateCrossfadeFactors } from '../player/transitions';
import type {
  MixEQType,
  MixEffectType,
  MixPreset,
  MixVolumeType,
  Playlist,
  PlaylistMixSettings,
  TrackTransitionConfig,
  Track,
} from '../types';
import { colors } from '../theme';
import { Cover, IconButton } from '../screens/ScreenParts';
import { GlassCard } from './GlassCard';

export interface PlaylistMixStudioProps {
  visible: boolean;
  playlist: Playlist;
  initialPairIndex?: number;
  onClose: () => void;
  onSave: (settings: PlaylistMixSettings) => void;
}

const DEFAULT_CONFIG: TrackTransitionConfig = {
  durationSeconds: 4,
  volume: 'overlap',
  eq: 'end_bass_swap',
  effect: 'none',
  preset: 'auto',
  bars: 4,
};

const BARS_OPTIONS: { bars: 2 | 4 | 8 | 16; seconds: number; label: string }[] = [
  { bars: 2, seconds: 4, label: '2 compassos (4s)' },
  { bars: 4, seconds: 7, label: '4 compassos (7s)' },
  { bars: 8, seconds: 14, label: '8 compassos (14s)' },
  { bars: 16, seconds: 20, label: '16 compassos (20s)' },
];

const VOLUME_OPTIONS: { id: MixVolumeType; label: string; desc: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { id: 'overlap', label: 'Fade in com corte na saída', desc: 'Faixa de saída corta no drop enquanto a nova sobe', icon: 'layers' },
  { id: 'equal_power', label: 'Fade in fade out', desc: 'Fade clássico de igual potência sem perda de energia', icon: 'shuffle' },
  { id: 'linear', label: 'Transição gradual', desc: 'Cruzamento gradual de volume com atenuação suave', icon: 'trending-up' },
  { id: 'cut', label: 'Corte central', desc: 'Corte instantâneo direto para o primeiro beat da faixa', icon: 'cut' },
];

const EQ_OPTIONS: { id: MixEQType; label: string; desc: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { id: 'end_bass_swap', label: 'Fim da troca de graves', desc: 'Corta graves da saída e solta o punch da entrada', icon: 'swap-horizontal' },
  { id: 'early_bass_swap', label: 'Início da troca de graves', desc: 'Troca os graves logo no primeiro beat da mix', icon: 'options' },
  { id: 'bass_cut', label: 'Corte de graves', desc: 'Atenua frequências baixas de ambas no meio do crossfade', icon: 'trending-down' },
  { id: 'none', label: 'Nenhum', desc: 'Sem alteração nas frequências de graves', icon: 'remove' },
];

const EFFECT_OPTIONS: { id: MixEffectType; label: string; desc: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { id: 'rise', label: 'Subida (Sweeper)', desc: 'Filtro passa-alta ascendente simulando sweep de DJ', icon: 'sparkles' },
  { id: 'low_pass', label: 'Filtro passa-baixa', desc: 'Efeito abafado progressivo até a entrada do drop', icon: 'funnel' },
  { id: 'high_pass', label: 'Filtro passa-alta', desc: 'Limpeza de graves e foco nos médios/agudos', icon: 'radio' },
  { id: 'reverb', label: 'Cauda de reverb', desc: 'Sensação espacial de clube na saída da música', icon: 'planet' },
  { id: 'none', label: 'Nenhum', desc: 'Áudio puro sem filtros ou processamento extra', icon: 'close-circle-outline' },
];

const PRESETS: { id: MixPreset; label: string; config: Partial<TrackTransitionConfig> }[] = [
  { id: 'auto', label: '✦ Automático', config: { durationSeconds: 7, volume: 'overlap', eq: 'end_bass_swap', effect: 'none', bars: 4 } },
  { id: 'fade', label: 'Transição Suave', config: { durationSeconds: 6, volume: 'equal_power', eq: 'none', effect: 'none', bars: 4 } },
  { id: 'rise', label: 'Subida Energética', config: { durationSeconds: 8, volume: 'overlap', eq: 'end_bass_swap', effect: 'rise', bars: 4 } },
  { id: 'blend', label: 'Troca de Graves', config: { durationSeconds: 8, volume: 'overlap', eq: 'early_bass_swap', effect: 'low_pass', bars: 4 } },
  { id: 'bass_drop', label: 'Corte de Graves', config: { durationSeconds: 4, volume: 'cut', eq: 'bass_cut', effect: 'high_pass', bars: 2 } },
];

function formatSec(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

function getTrackBpm(track?: Track | null): number {
  if (!track) return 124;
  const seed = (track.id || track.title || 'hueco')
    .split('')
    .reduce((acc: number, c: string) => acc + c.charCodeAt(0), 0);
  return 120 + (seed % 12);
}

function getTrackKey(track?: Track | null): string {
  if (!track) return '5A';
  const keys = ['1A', '2A', '3A', '4A', '5A', '6A', '7A', '8A', '9A', '10A', '11A', '12A', '8B', '5B', '11B', '4B'];
  const seed = (track.title || track.id || 'hueco')
    .split('')
    .reduce((acc: number, c: string) => acc + c.charCodeAt(0), 0);
  return keys[seed % keys.length];
}

function getWaveBarHeight(seed: string, second: number): number {
  const hash = (seed + second.toFixed(1))
    .split('')
    .reduce((acc, c) => ((acc << 5) - acc + c.charCodeAt(0)) | 0, 0);
  const normalized = Math.abs(hash % 100) / 100;
  return Math.max(18, Math.round(normalized * 44) + 14);
}

export function PlaylistMixStudio({
  visible,
  playlist,
  initialPairIndex = 0,
  onClose,
  onSave,
}: PlaylistMixStudioProps) {
  const tracks = playlist.tracks;
  const initialSettings = useMemo<PlaylistMixSettings>(() => {
    return playlist.mixSettings || {
      enabled: true,
      defaultConfig: DEFAULT_CONFIG,
      customTransitions: {},
    };
  }, [playlist.mixSettings]);

  const [activeTab, setActiveTab] = useState<'pairs' | 'automix'>('pairs');
  const [enabled, setEnabled] = useState(initialSettings.enabled);
  const [defaultConfig, setDefaultConfig] = useState<TrackTransitionConfig>(initialSettings.defaultConfig || DEFAULT_CONFIG);
  const [customTransitions, setCustomTransitions] = useState<Record<string, TrackTransitionConfig>>(initialSettings.customTransitions || {});
  const [selectedPairIndex, setSelectedPairIndex] = useState<number | null>(null);
  const [previewPlaying, setPreviewPlaying] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewPlayheadSec, setPreviewPlayheadSec] = useState<number | null>(null);
  const previewAudioA = useRef<AudioPlayer | null>(null);
  const previewAudioB = useRef<AudioPlayer | null>(null);
  const previewTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const previewAbort = useRef<AbortController | null>(null);

  const stopPreview = useCallback(() => {
    if (previewAbort.current) {
      previewAbort.current.abort();
      previewAbort.current = null;
    }
    if (previewTimer.current) {
      clearInterval(previewTimer.current);
      previewTimer.current = null;
    }
    if (previewAudioA.current) {
      try { previewAudioA.current.pause(); } catch {}
      try { previewAudioA.current.release(); } catch {}
      try { previewAudioA.current.remove(); } catch {}
      previewAudioA.current = null;
    }
    if (previewAudioB.current) {
      try { previewAudioB.current.pause(); } catch {}
      try { previewAudioB.current.release(); } catch {}
      try { previewAudioB.current.remove(); } catch {}
      previewAudioB.current = null;
    }
    setPreviewPlaying(false);
    setPreviewLoading(false);
    setPreviewPlayheadSec(null);
  }, []);

  const [activeDrawer, setActiveDrawer] = useState<'volume' | 'eq' | 'effect' | 'bars' | null>(null);

  const numTransitions = Math.max(0, tracks.length - 1);
  const pairIndex = selectedPairIndex !== null ? selectedPairIndex : initialPairIndex;
  const safePairIndex = Math.min(pairIndex, Math.max(0, numTransitions - 1));
  const trackA = tracks[safePairIndex] || null;
  const trackB = tracks[safePairIndex + 1] || null;
  const pairKey = trackA && trackB ? `${trackA.id}->${trackB.id}` : '';
  const currentConfig = (pairKey && customTransitions[pairKey]) || defaultConfig;

  const durationSec = currentConfig.durationSeconds || 4;
  const durA = Math.max(20, Math.round((trackA?.durationMs || 240000) / 1000));
  const durB = Math.max(20, Math.round((trackB?.durationMs || 240000) / 1000));

  // Cue points
  // Track A starts at the end: durA - durationSec
  // Track B starts at the start: 0
  const effectiveOutPoint = currentConfig.outPointSec !== undefined
    ? currentConfig.outPointSec
    : currentConfig.outCueSec !== undefined
    ? Math.max(0, durA - currentConfig.outCueSec)
    : Math.max(0, durA - durationSec);

  const effectiveInPoint = currentConfig.inPointSec !== undefined
    ? currentConfig.inPointSec
    : currentConfig.inCueSec !== undefined
    ? currentConfig.inCueSec
    : 0;

  const updateCurrentConfig = useCallback((partial: Partial<TrackTransitionConfig>) => {
    const updated = { ...currentConfig, ...partial };
    if (pairKey) {
      setCustomTransitions(prev => ({ ...prev, [pairKey]: updated }));
    } else {
      setDefaultConfig(updated);
    }
  }, [currentConfig, pairKey]);

  const updateOutPoint = useCallback((sec: number) => {
    const clamped = Math.max(0, Math.min(durA - durationSec, sec));
    updateCurrentConfig({ outPointSec: clamped, outCueSec: Math.max(0, durA - clamped), preset: 'custom' });
  }, [durA, durationSec, updateCurrentConfig]);

  const updateInPoint = useCallback((sec: number) => {
    const clamped = Math.max(0, Math.min(durB - durationSec, sec));
    updateCurrentConfig({ inPointSec: clamped, inCueSec: clamped, preset: 'custom' });
  }, [durB, durationSec, updateCurrentConfig]);

  // Touch scrubbing refs (accessed solely inside event callbacks)
  const dragTouchStartX_A = useRef(0);
  const dragSecStart_A = useRef(0);
  const dragTouchStartX_B = useRef(0);
  const dragSecStart_B = useRef(0);

  const handleNudge = (dir: -1 | 1) => {
    updateOutPoint(effectiveOutPoint + dir);
    updateInPoint(effectiveInPoint + dir);
  };

  const startPreview = useCallback(async () => {
    if (!trackA || !trackB) return;
    stopPreview();

    const abort = new AbortController();
    previewAbort.current = abort;
    setPreviewLoading(true);
    setPreviewPlaying(true);

    try {
      const [urlA, urlB] = await Promise.all([
        trackA.streamUrl || resolveAudioStream(trackA.id, trackA.title, trackA.artists, { durationMs: trackA.durationMs, signal: abort.signal }),
        trackB.streamUrl || resolveAudioStream(trackB.id, trackB.title, trackB.artists, { durationMs: trackB.durationMs, signal: abort.signal }),
      ]);

      if (abort.signal.aborted) return;

      const pA = createAudioPlayer({ uri: urlA }, { updateInterval: 30 });
      const pB = createAudioPlayer({ uri: urlB }, { updateInterval: 30 });
      previewAudioA.current = pA;
      previewAudioB.current = pB;

      const startSecA = Math.max(0, effectiveOutPoint - 3);
      pA.volume = 1.0;
      await pA.seekTo(startSecA);

      pB.volume = 0.0;
      await pB.seekTo(effectiveInPoint);

      if (abort.signal.aborted) return;
      setPreviewLoading(false);
      pA.play();

      let bStarted = false;
      const startTime = Date.now();
      const crossfadeTotalMs = durationSec * 1000;
      const leadInMs = (effectiveOutPoint - startSecA) * 1000;
      const postDropMs = 3000;
      const totalDurationMs = leadInMs + crossfadeTotalMs + postDropMs;

      previewTimer.current = setInterval(() => {
        if (abort.signal.aborted) {
          stopPreview();
          return;
        }

        const elapsed = Date.now() - startTime;
        const currentSecA = startSecA + elapsed / 1000;
        setPreviewPlayheadSec(currentSecA);

        if (elapsed >= leadInMs && !bStarted) {
          bStarted = true;
          try { pB.play(); } catch {}
        }

        if (elapsed >= leadInMs && elapsed < leadInMs + crossfadeTotalMs) {
          const crossfadeProgress = (elapsed - leadInMs) / crossfadeTotalMs;
          const { outFactor, inFactor } = calculateCrossfadeFactors(crossfadeProgress, currentConfig.volume || 'overlap');
          try {
            pA.volume = Math.max(0, Math.min(1, outFactor));
            pB.volume = Math.max(0, Math.min(1, inFactor));
          } catch {}
        } else if (elapsed >= leadInMs + crossfadeTotalMs) {
          try {
            pA.volume = 0;
            pA.pause();
            pB.volume = 1.0;
          } catch {}
        }

        if (elapsed >= totalDurationMs) {
          stopPreview();
        }
      }, 30);
    } catch {
      stopPreview();
    }
  }, [trackA, trackB, effectiveOutPoint, effectiveInPoint, durationSec, currentConfig.volume, stopPreview]);

  useEffect(() => {
    return () => { stopPreview(); };
  }, [stopPreview]);

  const applyPreset = (preset: MixPreset) => {
    const found = PRESETS.find(p => p.id === preset);
    if (!found) return;
    updateCurrentConfig({ ...found.config, preset });
  };

  const handleSave = () => {
    stopPreview();
    onSave({
      enabled,
      defaultConfig,
      customTransitions,
    });
    onClose();
  };

  // Generate audio waveform bars
  const seedA = trackA?.title || trackA?.id || 'trackA';
  const seedB = trackB?.title || trackB?.id || 'trackB';
  const totalSlices = 36;

  const barsA = useMemo(() => {
    const list: { height: number; isInMix: boolean }[] = [];
    const viewSpanSec = 20;
    const startSec = Math.max(0, effectiveOutPoint - (viewSpanSec - durationSec) / 2);
    for (let i = 0; i < totalSlices; i++) {
      const sec = startSec + (i / totalSlices) * viewSpanSec;
      const height = getWaveBarHeight(seedA, sec);
      const isInMix = sec >= effectiveOutPoint && sec <= effectiveOutPoint + durationSec;
      list.push({ height, isInMix });
    }
    return list;
  }, [seedA, effectiveOutPoint, durationSec]);

  const barsB = useMemo(() => {
    const list: { height: number; isInMix: boolean }[] = [];
    const viewSpanSec = 20;
    const startSec = Math.max(0, effectiveInPoint - (viewSpanSec - durationSec) / 2);
    for (let i = 0; i < totalSlices; i++) {
      const sec = startSec + (i / totalSlices) * viewSpanSec;
      const height = getWaveBarHeight(seedB, sec);
      const isInMix = sec >= effectiveInPoint && sec <= effectiveInPoint + durationSec;
      list.push({ height, isInMix });
    }
    return list;
  }, [seedB, effectiveInPoint, durationSec]);

  // Dynamic Quadradinho offset calculation
  const maxOutA = Math.max(1, durA - durationSec);
  const progressA = Math.max(0, Math.min(1, effectiveOutPoint / maxOutA));
  // Track A: progressA = 1 when at end -> box at right (38% to 92%)
  // Dragging left decreases progressA -> box moves left towards 4%
  const boxLeftPercent_A = 4 + progressA * 36;

  const maxInB = Math.max(1, durB - durationSec);
  const progressB = Math.max(0, Math.min(1, effectiveInPoint / maxInB));
  // Track B: progressB = 0 when at start -> box at left (4% to 58%)
  // Dragging right increases progressB -> box moves right towards 40%
  const boxLeftPercent_B = 4 + progressB * 36;

  const viewSpanSec = 20;
  const startSecA = Math.max(0, effectiveOutPoint - (viewSpanSec - durationSec) / 2);
  const startSecB = Math.max(0, effectiveInPoint - (viewSpanSec - durationSec) / 2);

  const playheadPercentA = previewPlayheadSec !== null
    ? Math.max(0, Math.min(100, ((previewPlayheadSec - startSecA) / viewSpanSec) * 100))
    : null;

  const currentSecB = previewPlayheadSec !== null
    ? effectiveInPoint + Math.max(0, previewPlayheadSec - effectiveOutPoint)
    : null;

  const playheadPercentB = currentSecB !== null
    ? Math.max(0, Math.min(100, ((currentSecB - startSecB) / viewSpanSec) * 100))
    : null;

  const handleClose = () => {
    stopPreview();
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
      <View style={s.container}>
        {/* Top Header */}
        <View style={s.header}>
          <IconButton name="close" label="Fechar estúdio de mixagem" onPress={handleClose} />
          <View style={s.tabSwitcher}>
            <Pressable
              onPress={() => setActiveTab('automix')}
              style={[s.tabButton, activeTab === 'automix' && s.tabButtonActive]}
            >
              <Text style={[s.tabButtonText, activeTab === 'automix' && s.tabButtonTextActive]}>
                Automix
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setActiveTab('pairs')}
              style={[s.tabButton, activeTab === 'pairs' && s.tabButtonActive]}
            >
              <Text style={[s.tabButtonText, activeTab === 'pairs' && s.tabButtonTextActive]}>
                Faixas
              </Text>
            </Pressable>
          </View>
          <Pressable accessibilityRole="button" onPress={handleSave} style={s.saveButton}>
            <Text style={s.saveButtonText}>Salvar</Text>
          </Pressable>
        </View>

        <ScrollView style={s.scroll} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
          {/* Main Activation Switch */}
          <GlassCard style={s.switchCard}>
            <View style={s.switchInfo}>
              <View style={s.switchIconWrap}>
                <Ionicons name="git-merge-outline" size={20} color={colors.accent} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={s.switchTitle}>Mixer Spotify DJ Ativo</Text>
                <Text style={s.switchDesc}>Conecta as músicas sem pausas com corte e crossfade contínuo</Text>
              </View>
            </View>
            <Switch
              accessibilityLabel="Ativar mixagem nesta playlist"
              value={enabled}
              onValueChange={setEnabled}
              trackColor={{ false: colors.elevated, true: '#1ed76066' }}
              thumbColor={enabled ? '#1ed760' : colors.muted}
            />
          </GlassCard>

          {tracks.length < 2 ? (
            <View style={s.emptyBox}>
              <Ionicons name="disc-outline" size={48} color={colors.muted} />
              <Text style={s.emptyTitle}>Adicione pelo menos 2 músicas</Text>
              <Text style={s.emptyDesc}>
                Para personalizar as transições e equalização da mixagem, a playlist precisa ter no mínimo duas músicas.
              </Text>
            </View>
          ) : (
            <>
              {/* Pair Navigator */}
              {activeTab === 'pairs' && (
                <View style={s.pairNav}>
                  <IconButton
                    name="chevron-back"
                    label="Transição anterior"
                    disabled={safePairIndex <= 0}
                    onPress={() => setSelectedPairIndex(Math.max(0, safePairIndex - 1))}
                  />
                  <View style={s.pairCenter}>
                    <Text style={s.pairCounter}>TRANSIÇÃO {safePairIndex + 1} DE {numTransitions}</Text>
                    <View style={s.pairTracksRow}>
                      <Text style={s.pairTrackName} numberOfLines={1}>{trackA?.title || 'Faixa A'}</Text>
                      <Ionicons name="arrow-forward" size={13} color="#1ed760" style={{ marginHorizontal: 6 }} />
                      <Text style={s.pairTrackName} numberOfLines={1}>{trackB?.title || 'Faixa B'}</Text>
                    </View>
                  </View>
                  <IconButton
                    name="chevron-forward"
                    label="Próxima transição"
                    disabled={safePairIndex >= numTransitions - 1}
                    onPress={() => setSelectedPairIndex(Math.min(numTransitions - 1, safePairIndex + 1))}
                  />
                </View>
              )}

              {/* ── THE MIX STAGE & WAVEFORMS ── */}
              <GlassCard style={s.mixStageCard}>
                {/* TRACK A: OUTGOING TRACK (Top) */}
                <View style={s.trackStageRow}>
                  {/* Track A Header */}
                  <View style={s.trackStageHeader}>
                    <View style={s.tagWrap}>
                      <View style={[s.badgeA, { backgroundColor: '#00c8ff22', borderColor: '#00c8ff55' }]}>
                        <Text style={[s.badgeTextA, { color: '#00c8ff' }]}>SAÍDA (A)</Text>
                      </View>
                      <Text style={s.trackStageTitle} numberOfLines={1}>
                        {trackA?.title || 'Música Atual'}
                      </Text>
                    </View>

                    {/* Exact Seconds Interval Pill with Steppers */}
                    <View style={s.secondsPill}>
                      <Pressable
                        onPress={() => updateOutPoint(effectiveOutPoint - 1)}
                        style={({ pressed }) => [s.stepBtn, pressed && { opacity: 0.6 }]}
                        hitSlop={6}
                      >
                        <Text style={s.stepBtnText}>−</Text>
                      </Pressable>
                      <Text style={[s.secondsPillText, { color: '#00c8ff' }]}>
                        {formatSec(effectiveOutPoint)} – {formatSec(effectiveOutPoint + durationSec)} ({durationSec}s)
                      </Text>
                      <Pressable
                        onPress={() => updateOutPoint(effectiveOutPoint + 1)}
                        style={({ pressed }) => [s.stepBtn, pressed && { opacity: 0.6 }]}
                        hitSlop={6}
                      >
                        <Text style={s.stepBtnText}>+</Text>
                      </Pressable>
                    </View>
                  </View>

                  {/* Track A Waveform Canvas with Quadradinho */}
                  <View
                    onStartShouldSetResponder={() => true}
                    onMoveShouldSetResponder={() => true}
                    onResponderGrant={(e) => {
                      dragTouchStartX_A.current = e.nativeEvent.pageX;
                      dragSecStart_A.current = effectiveOutPoint;
                    }}
                    onResponderMove={(e) => {
                      const dx = e.nativeEvent.pageX - dragTouchStartX_A.current;
                      const diffSec = Math.round(dx / 10);
                      const nextSec = Math.max(0, Math.min(durA - durationSec, dragSecStart_A.current + diffSec));
                      updateOutPoint(nextSec);
                    }}
                    style={s.waveformCanvas}
                  >
                    {/* Spine line */}
                    <View style={s.spineLine} />

                    {/* Bars */}
                    <View style={s.barsFlexRow}>
                      {barsA.map((b, i) => (
                        <View
                          key={`wa-${i}`}
                          style={[
                            s.waveBarStem,
                            {
                              height: b.height,
                              backgroundColor: b.isInMix ? '#2563eb' : 'rgba(37, 99, 235, 0.25)',
                            },
                          ]}
                        />
                      ))}
                    </View>

                    {/* O Quadradinho da Faixa A */}
                    <View
                      style={[
                        s.quadradinhoBox,
                        {
                          left: `${boxLeftPercent_A}%`,
                          borderColor: '#00c8ff88',
                          width: '58%',
                        },
                      ]}
                    >
                      <Text style={[s.quadradinhoTime, { left: 6, color: '#00c8ff' }]}>
                        {formatSec(effectiveOutPoint)}
                      </Text>
                      <Text style={[s.quadradinhoTime, { right: 6, color: '#00c8ff' }]}>
                        {formatSec(effectiveOutPoint + durationSec)}
                      </Text>
                      {/* Cyan Volume curve line inside box */}
                      <View style={[s.curveLineVisual, { backgroundColor: '#00c8ff' }]} />
                    </View>

                    {/* Cyan Playhead Line for Preview A */}
                    {playheadPercentA !== null && (
                      <View style={[s.playheadLine, { left: `${playheadPercentA}%`, borderLeftColor: '#00c8ff' }]}>
                        <View style={[s.playheadCap, { backgroundColor: '#00c8ff' }]} />
                      </View>
                    )}
                  </View>
                </View>

                {/* CENTER DIVIDER: BEAT GRID TICKS, NUDGE ARROWS & PREVIEW */}
                <View style={s.centerControlsRow}>
                  <Pressable
                    onPress={() => handleNudge(-1)}
                    style={({ pressed }) => [s.nudgeBtn, pressed && { opacity: 0.6 }]}
                    hitSlop={8}
                  >
                    <Ionicons name="chevron-back" size={14} color="#fff" />
                  </Pressable>

                  {/* Beat Grid Ruler (Green & White Ticks) */}
                  <View style={s.beatGridRuler}>
                    {Array.from({ length: 24 }).map((_, idx) => (
                      <View
                        key={`tick-${idx}`}
                        style={[
                          s.beatTick,
                          idx % 4 === 0 ? s.beatTickMajor : s.beatTickMinor,
                        ]}
                      />
                    ))}
                  </View>

                  {/* Play/Stop Preview Center Button */}
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={previewPlaying ? "Pausar prévia da transição" : "Ouvir prévia da transição"}
                    onPress={() => previewPlaying ? stopPreview() : void startPreview()}
                    style={({ pressed }) => [s.previewCenterBtn, pressed && { transform: [{ scale: 0.95 }] }]}
                  >
                    {previewLoading ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Ionicons
                        name={previewPlaying ? 'stop' : 'play'}
                        size={18}
                        color="#fff"
                        style={!previewPlaying ? { marginLeft: 2 } : undefined}
                      />
                    )}
                  </Pressable>

                  <Pressable
                    onPress={() => handleNudge(1)}
                    style={({ pressed }) => [s.nudgeBtn, pressed && { opacity: 0.6 }]}
                    hitSlop={8}
                  >
                    <Ionicons name="chevron-forward" size={14} color="#fff" />
                  </Pressable>
                </View>

                {/* TRACK B: INCOMING TRACK (Bottom) */}
                <View style={s.trackStageRow}>
                  {/* Track B Header */}
                  <View style={s.trackStageHeader}>
                    <View style={s.tagWrap}>
                      <View style={[s.badgeA, { backgroundColor: '#1ed76022', borderColor: '#1ed76055' }]}>
                        <Text style={[s.badgeTextA, { color: '#1ed760' }]}>ENTRADA (B)</Text>
                      </View>
                      <Text style={s.trackStageTitle} numberOfLines={1}>
                        {trackB?.title || 'Próxima Música'}
                      </Text>
                    </View>

                    {/* Exact Seconds Interval Pill with Steppers */}
                    <View style={s.secondsPill}>
                      <Pressable
                        onPress={() => updateInPoint(effectiveInPoint - 1)}
                        style={({ pressed }) => [s.stepBtn, pressed && { opacity: 0.6 }]}
                        hitSlop={6}
                      >
                        <Text style={s.stepBtnText}>−</Text>
                      </Pressable>
                      <Text style={[s.secondsPillText, { color: '#1ed760' }]}>
                        {formatSec(effectiveInPoint)} – {formatSec(effectiveInPoint + durationSec)} ({durationSec}s)
                      </Text>
                      <Pressable
                        onPress={() => updateInPoint(effectiveInPoint + 1)}
                        style={({ pressed }) => [s.stepBtn, pressed && { opacity: 0.6 }]}
                        hitSlop={6}
                      >
                        <Text style={s.stepBtnText}>+</Text>
                      </Pressable>
                    </View>
                  </View>

                  {/* Track B Waveform Canvas with Quadradinho */}
                  <View
                    onStartShouldSetResponder={() => true}
                    onMoveShouldSetResponder={() => true}
                    onResponderGrant={(e) => {
                      dragTouchStartX_B.current = e.nativeEvent.pageX;
                      dragSecStart_B.current = effectiveInPoint;
                    }}
                    onResponderMove={(e) => {
                      const dx = e.nativeEvent.pageX - dragTouchStartX_B.current;
                      const diffSec = Math.round(dx / 10);
                      const nextSec = Math.max(0, Math.min(durB - durationSec, dragSecStart_B.current + diffSec));
                      updateInPoint(nextSec);
                    }}
                    style={s.waveformCanvas}
                  >
                    {/* Spine line */}
                    <View style={s.spineLine} />

                    {/* Bars */}
                    <View style={s.barsFlexRow}>
                      {barsB.map((b, i) => (
                        <View
                          key={`wb-${i}`}
                          style={[
                            s.waveBarStem,
                            {
                              height: b.height,
                              backgroundColor: b.isInMix ? '#1ed760' : 'rgba(30, 215, 96, 0.25)',
                            },
                          ]}
                        />
                      ))}
                    </View>

                    {/* O Quadradinho da Faixa B */}
                    <View
                      style={[
                        s.quadradinhoBox,
                        {
                          left: `${boxLeftPercent_B}%`,
                          borderColor: '#1ed76088',
                          width: '58%',
                        },
                      ]}
                    >
                      <Text style={[s.quadradinhoTime, { left: 6, color: '#1ed760' }]}>
                        {formatSec(effectiveInPoint)}
                      </Text>
                      <Text style={[s.quadradinhoTime, { right: 6, color: '#1ed760' }]}>
                        {formatSec(effectiveInPoint + durationSec)}
                      </Text>
                      {/* Green Volume curve line inside box */}
                      <View style={[s.curveLineVisual, { backgroundColor: '#1ed760' }]} />
                    </View>

                    {/* Green Playhead Line for Preview B */}
                    {playheadPercentB !== null && previewPlayheadSec !== null && previewPlayheadSec >= effectiveOutPoint && (
                      <View style={[s.playheadLine, { left: `${playheadPercentB}%`, borderLeftColor: '#1ed760' }]}>
                        <View style={[s.playheadCap, { backgroundColor: '#1ed760' }]} />
                      </View>
                    )}
                  </View>
                </View>
              </GlassCard>

              {/* ── TRACK CARDS INFO (BPM, KEY, CUE TIME) ── */}
              <View style={s.trackCardsRow}>
                <View style={s.trackCard}>
                  <Cover uri={trackA?.coverUrl} size={36} />
                  <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
                    <Text style={s.cardTrackTitle} numberOfLines={1}>{trackA?.title || 'Faixa A'}</Text>
                    <Text style={s.cardTrackArtist} numberOfLines={1}>{trackA?.artists}</Text>
                  </View>
                  <View style={s.cardMetaWrap}>
                    <Text style={s.cardMetaBpm}>{getTrackBpm(trackA)} bpm · {getTrackKey(trackA)}</Text>
                    <Text style={s.cardMetaCue}>Mix: {formatSec(effectiveOutPoint)}s</Text>
                  </View>
                </View>

                <View style={s.trackCard}>
                  <Cover uri={trackB?.coverUrl} size={36} />
                  <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
                    <Text style={s.cardTrackTitle} numberOfLines={1}>{trackB?.title || 'Faixa B'}</Text>
                    <Text style={s.cardTrackArtist} numberOfLines={1}>{trackB?.artists}</Text>
                  </View>
                  <View style={s.cardMetaWrap}>
                    <Text style={s.cardMetaBpm}>{getTrackBpm(trackB)} bpm · {getTrackKey(trackB)}</Text>
                    <Text style={s.cardMetaCue}>Entra: {formatSec(effectiveInPoint)}s</Text>
                  </View>
                </View>
              </View>

              {/* ── QUICK PRESETS ── */}
              <View style={s.sectionHeader}>
                <Text style={s.sectionTitle}>PREDEFINIÇÕES RÁPIDAS</Text>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.presetsRow}>
                {PRESETS.map(preset => {
                  const active = currentConfig.preset === preset.id;
                  return (
                    <Pressable
                      key={preset.id}
                      style={[s.presetChip, active && s.presetChipActive]}
                      onPress={() => applyPreset(preset.id)}
                    >
                      <Ionicons
                        name={active ? 'checkmark-circle' : 'sparkles-outline'}
                        size={13}
                        color={active ? '#000' : '#1ed760'}
                      />
                      <Text style={[s.presetChipText, active && s.presetChipTextActive]}>
                        {preset.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>

              {/* ── PARAMETERS ROWS (VOLUME, EQ, EFFECT, BARS) ── */}
              <View style={s.sectionHeader}>
                <Text style={s.sectionTitle}>PERSONALIZAR PARÂMETROS</Text>
              </View>

              <View style={s.paramsList}>
                {/* Volume Row */}
                <Pressable
                  style={s.paramRow}
                  onPress={() => setActiveDrawer(activeDrawer === 'volume' ? null : 'volume')}
                >
                  <View style={s.paramRowLeft}>
                    <View style={[s.paramIconWrap, { backgroundColor: '#00c8ff22' }]}>
                      <Ionicons name="volume-medium-outline" size={16} color="#00c8ff" />
                    </View>
                    <View>
                      <Text style={s.paramRowLabel}>Volume</Text>
                      <Text style={s.paramRowValue}>
                        {VOLUME_OPTIONS.find(o => o.id === currentConfig.volume)?.label || 'Fade'}
                      </Text>
                    </View>
                  </View>
                  <Ionicons
                    name={activeDrawer === 'volume' ? 'chevron-up' : 'chevron-forward'}
                    size={16}
                    color={colors.muted}
                  />
                </Pressable>
                {activeDrawer === 'volume' && (
                  <View style={s.drawerContent}>
                    {VOLUME_OPTIONS.map(opt => (
                      <Pressable
                        key={opt.id}
                        style={[s.drawerOption, currentConfig.volume === opt.id && s.drawerOptionActive]}
                        onPress={() => {
                          updateCurrentConfig({ volume: opt.id, preset: 'custom' });
                          setActiveDrawer(null);
                        }}
                      >
                        <Text style={[s.drawerOptionLabel, currentConfig.volume === opt.id && s.drawerOptionLabelActive]}>
                          {opt.label}
                        </Text>
                        <Text style={s.drawerOptionDesc}>{opt.desc}</Text>
                      </Pressable>
                    ))}
                  </View>
                )}

                {/* EQ Row */}
                <Pressable
                  style={s.paramRow}
                  onPress={() => setActiveDrawer(activeDrawer === 'eq' ? null : 'eq')}
                >
                  <View style={s.paramRowLeft}>
                    <View style={[s.paramIconWrap, { backgroundColor: '#f5c51822' }]}>
                      <Ionicons name="options-outline" size={16} color="#f5c518" />
                    </View>
                    <View>
                      <Text style={s.paramRowLabel}>EQ (Graves)</Text>
                      <Text style={s.paramRowValue}>
                        {EQ_OPTIONS.find(o => o.id === currentConfig.eq)?.label || 'Troca de graves'}
                      </Text>
                    </View>
                  </View>
                  <Ionicons
                    name={activeDrawer === 'eq' ? 'chevron-up' : 'chevron-forward'}
                    size={16}
                    color={colors.muted}
                  />
                </Pressable>
                {activeDrawer === 'eq' && (
                  <View style={s.drawerContent}>
                    {EQ_OPTIONS.map(opt => (
                      <Pressable
                        key={opt.id}
                        style={[s.drawerOption, currentConfig.eq === opt.id && s.drawerOptionActive]}
                        onPress={() => {
                          updateCurrentConfig({ eq: opt.id, preset: 'custom' });
                          setActiveDrawer(null);
                        }}
                      >
                        <Text style={[s.drawerOptionLabel, currentConfig.eq === opt.id && s.drawerOptionLabelActive]}>
                          {opt.label}
                        </Text>
                        <Text style={s.drawerOptionDesc}>{opt.desc}</Text>
                      </Pressable>
                    ))}
                  </View>
                )}

                {/* Effect / Filter Row */}
                <Pressable
                  style={s.paramRow}
                  onPress={() => setActiveDrawer(activeDrawer === 'effect' ? null : 'effect')}
                >
                  <View style={s.paramRowLeft}>
                    <View style={[s.paramIconWrap, { backgroundColor: '#e879f922' }]}>
                      <Ionicons name="sparkles-outline" size={16} color="#e879f9" />
                    </View>
                    <View>
                      <Text style={s.paramRowLabel}>Filtro / Efeito</Text>
                      <Text style={s.paramRowValue}>
                        {EFFECT_OPTIONS.find(o => o.id === currentConfig.effect)?.label || 'Nenhum'}
                      </Text>
                    </View>
                  </View>
                  <Ionicons
                    name={activeDrawer === 'effect' ? 'chevron-up' : 'chevron-forward'}
                    size={16}
                    color={colors.muted}
                  />
                </Pressable>
                {activeDrawer === 'effect' && (
                  <View style={s.drawerContent}>
                    {EFFECT_OPTIONS.map(opt => (
                      <Pressable
                        key={opt.id}
                        style={[s.drawerOption, currentConfig.effect === opt.id && s.drawerOptionActive]}
                        onPress={() => {
                          updateCurrentConfig({ effect: opt.id, preset: 'custom' });
                          setActiveDrawer(null);
                        }}
                      >
                        <Text style={[s.drawerOptionLabel, currentConfig.effect === opt.id && s.drawerOptionLabelActive]}>
                          {opt.label}
                        </Text>
                        <Text style={s.drawerOptionDesc}>{opt.desc}</Text>
                      </Pressable>
                    ))}
                  </View>
                )}

                {/* Bars / Compassos Row */}
                <Pressable
                  style={s.paramRow}
                  onPress={() => setActiveDrawer(activeDrawer === 'bars' ? null : 'bars')}
                >
                  <View style={s.paramRowLeft}>
                    <View style={[s.paramIconWrap, { backgroundColor: '#1ed76022' }]}>
                      <Ionicons name="time-outline" size={16} color="#1ed760" />
                    </View>
                    <View>
                      <Text style={s.paramRowLabel}>Compassos / Duração</Text>
                      <Text style={s.paramRowValue}>
                        {BARS_OPTIONS.find(o => o.bars === (currentConfig.bars || 4))?.label || `${durationSec} segundos`}
                      </Text>
                    </View>
                  </View>
                  <Ionicons
                    name={activeDrawer === 'bars' ? 'chevron-up' : 'chevron-forward'}
                    size={16}
                    color={colors.muted}
                  />
                </Pressable>
                {activeDrawer === 'bars' && (
                  <View style={s.drawerContent}>
                    {BARS_OPTIONS.map(opt => (
                      <Pressable
                        key={opt.bars}
                        style={[s.drawerOption, currentConfig.bars === opt.bars && s.drawerOptionActive]}
                        onPress={() => {
                          updateCurrentConfig({ bars: opt.bars, durationSeconds: opt.seconds, preset: 'custom' });
                          setActiveDrawer(null);
                        }}
                      >
                        <Text style={[s.drawerOptionLabel, currentConfig.bars === opt.bars && s.drawerOptionLabelActive]}>
                          {opt.label}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                )}
              </View>

              {/* Apply to All Tracks Button */}
              {pairKey ? (
                <Pressable
                  style={s.applyAllBtn}
                  onPress={() => {
                    setDefaultConfig(currentConfig);
                    setCustomTransitions({});
                  }}
                >
                  <Ionicons name="copy-outline" size={15} color={colors.accent} />
                  <Text style={s.applyAllBtnText}>Aplicar esta transição para toda a playlist</Text>
                </Pressable>
              ) : null}
            </>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121214',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.08)',
  },
  tabSwitcher: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 20,
    padding: 3,
  },
  tabButton: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 16,
  },
  tabButtonActive: {
    backgroundColor: '#fff',
  },
  tabButtonText: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 11,
    fontWeight: '700',
  },
  tabButtonTextActive: {
    color: '#000',
  },
  saveButton: {
    backgroundColor: '#1ed760',
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 20,
  },
  saveButtonText: {
    color: '#000',
    fontSize: 12,
    fontWeight: '800',
  },
  scroll: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 40,
    gap: 16,
  },
  switchCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    borderRadius: 18,
    backgroundColor: '#1c1c1f',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  switchInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
    paddingRight: 8,
  },
  switchIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(45, 212, 191, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  switchTitle: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  switchDesc: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 11,
    lineHeight: 15,
  },
  emptyBox: {
    padding: 32,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  emptyTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  emptyDesc: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 19,
  },
  pairNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  pairCenter: {
    alignItems: 'center',
    gap: 3,
  },
  pairCounter: {
    color: '#1ed760',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  pairTracksRow: {
    flexDirection: 'row',
    alignItems: 'center',
    maxWidth: 240,
  },
  pairTrackName: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
    maxWidth: 100,
  },
  mixStageCard: {
    borderRadius: 22,
    backgroundColor: '#18181c',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.10)',
    padding: 14,
    gap: 12,
  },
  trackStageRow: {
    gap: 8,
  },
  trackStageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  tagWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
    minWidth: 0,
  },
  badgeA: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
  },
  badgeTextA: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  trackStageTitle: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
    flex: 1,
  },
  secondsPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#0a0a0c',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: 14,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  stepBtn: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBtnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  secondsPillText: {
    fontSize: 10,
    fontWeight: '700',
    paddingHorizontal: 4,
  },
  waveformCanvas: {
    height: 72,
    backgroundColor: '#0f0f12',
    borderRadius: 14,
    position: 'relative',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  spineLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 36,
    height: 1,
    backgroundColor: 'rgba(254, 243, 199, 0.4)',
    zIndex: 1,
  },
  barsFlexRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    height: '100%',
    zIndex: 2,
  },
  waveBarStem: {
    width: 4.5,
    borderRadius: 2.25,
  },
  quadradinhoBox: {
    position: 'absolute',
    top: 2,
    bottom: 2,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    zIndex: 3,
    justifyContent: 'center',
  },
  quadradinhoTime: {
    position: 'absolute',
    top: 4,
    fontSize: 8.5,
    fontWeight: '800',
  },
  curveLineVisual: {
    position: 'absolute',
    left: 4,
    right: 4,
    bottom: 8,
    height: 2,
    borderRadius: 1,
  },
  playheadLine: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 2,
    borderLeftWidth: 2,
    zIndex: 10,
    pointerEvents: 'none',
  },
  playheadCap: {
    position: 'absolute',
    top: -2,
    left: -4,
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  centerControlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
    paddingHorizontal: 6,
  },
  nudgeBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#24242a',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  beatGridRuler: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: 12,
  },
  beatTick: {
    borderRadius: 1,
  },
  beatTickMajor: {
    width: 2,
    height: 14,
    backgroundColor: '#1ed760',
  },
  beatTickMinor: {
    width: 1.5,
    height: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
  },
  previewCenterBtn: {
    width: 38,
    height: 38,
    borderRadius: 14,
    backgroundColor: '#2b2b32',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
  },
  trackCardsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  trackCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#18181c',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    padding: 8,
  },
  cardTrackTitle: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  cardTrackArtist: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 9.5,
  },
  cardMetaWrap: {
    alignItems: 'flex-end',
    gap: 2,
  },
  cardMetaBpm: {
    color: '#fff',
    fontSize: 9.5,
    fontWeight: '800',
  },
  cardMetaCue: {
    color: '#1ed760',
    fontSize: 9,
    fontWeight: '700',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  sectionTitle: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  presetsRow: {
    gap: 8,
    paddingVertical: 2,
  },
  presetChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#18181c',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 18,
  },
  presetChipActive: {
    backgroundColor: '#1ed760',
    borderColor: '#1ed760',
  },
  presetChipText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  presetChipTextActive: {
    color: '#000',
  },
  paramsList: {
    backgroundColor: '#18181c',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    overflow: 'hidden',
  },
  paramRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
  },
  paramRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  paramIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  paramRowLabel: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  paramRowValue: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  drawerContent: {
    backgroundColor: '#141417',
    padding: 8,
    gap: 4,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
  },
  drawerOption: {
    padding: 10,
    borderRadius: 10,
    backgroundColor: 'transparent',
    gap: 2,
  },
  drawerOptionActive: {
    backgroundColor: 'rgba(30, 215, 96, 0.12)',
  },
  drawerOptionLabel: {
    color: 'rgba(255, 255, 255, 0.9)',
    fontSize: 12,
    fontWeight: '700',
  },
  drawerOptionLabelActive: {
    color: '#1ed760',
  },
  drawerOptionDesc: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 10,
  },
  applyAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#18181c',
    borderWidth: 1,
    borderColor: 'rgba(45, 212, 191, 0.3)',
    borderRadius: 14,
    paddingVertical: 12,
  },
  applyAllBtnText: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: '700',
  },
});

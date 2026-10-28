import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, Switch, Text, View } from 'react-native';
import Slider from '@react-native-community/slider';
import { Ionicons } from '@expo/vector-icons';
import { createAudioPlayer, type AudioPlayer } from 'expo-audio';
import type { Playlist, PlaylistMixSettings, Track, TrackTransitionConfig } from '../types';
import { colors, themedStyles, useHuecoTheme } from '../theme';
import { Cover } from './Cover';
import { GlassCard } from './GlassCard';
import { resolveAudioStream } from '../api/innertube';
import { preparePlaybackSource } from '../player/prepareSource';
import { getPlaybackTrack } from '../library/useDeviceLibraryStore';
import { usePlayerStore } from '../player/usePlayerStore';
import { waitForAudio } from '../player/waitForAudio';
import { MIX_PRESETS, mixPoints, mixPreset } from '../player/mixSettings';
import { calculateCrossfadeFactors } from '../player/transitions';
import { nativeDeadline, tracePlayback } from '../player/playbackTrace';

export interface PlaylistMixStudioProps {
  visible: boolean; playlist: Playlist; initialPairIndex?: number;
  onClose: () => void; onSave: (settings: PlaylistMixSettings) => void;
}

export function PlaylistMixStudio(props: PlaylistMixStudioProps) {
  return <Modal visible={props.visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={props.onClose}>
    {props.visible && <MixEditor {...props} />}
  </Modal>;
}

function MixEditor({ playlist, initialPairIndex, onClose, onSave }: PlaylistMixStudioProps) {
  useHuecoTheme();
  const [enabled, setEnabled] = useState(playlist.mixSettings?.enabled ?? true);
  const [defaults, setDefaults] = useState(playlist.mixSettings?.defaultConfig ?? mixPreset('auto'));
  const [pairs, setPairs] = useState(playlist.mixSettings?.customTransitions ?? {});
  const [scope, setScope] = useState<'playlist' | 'pair'>(initialPairIndex === undefined ? 'playlist' : 'pair');
  const [pairIndex, setPairIndex] = useState(Math.max(0, Math.min(initialPairIndex ?? 0, playlist.tracks.length - 2)));
  const [advanced, setAdvanced] = useState(false);
  const [preview, setPreview] = useState<'idle' | 'loading' | 'playing'>('idle');
  const [error, setError] = useState<string | null>(null);
  const audition = useRef<{ controller: AbortController; players: AudioPlayer[]; timer?: ReturnType<typeof setInterval> } | null>(null);
  const trackA = playlist.tracks[pairIndex], trackB = playlist.tracks[pairIndex + 1];
  const key = trackA && trackB ? `${trackA.id}->${trackB.id}` : '';
  const config = scope === 'pair' && pairs[key] ? pairs[key] : defaults;
  const durationA = (trackA?.durationMs || 0) / 1000, durationB = (trackB?.durationMs || 0) / 1000;
  const points = mixPoints(config, durationA, durationB);
  const scopeLabel = scope === 'playlist' ? 'Para toda a playlist' : 'Somente esta transição';

  const stop = () => {
    const current = audition.current; audition.current = null;
    current?.controller.abort(); if (current?.timer) clearInterval(current.timer);
    current?.players.forEach(p => { try { p.pause(); p.remove(); } catch { /* already released */ } });
    setPreview('idle');
  };
  useEffect(() => () => {
    const current = audition.current; audition.current = null; current?.controller.abort();
    if (current?.timer) clearInterval(current.timer);
    current?.players.forEach(p => { try { p.pause(); p.remove(); } catch { /* released */ } });
  }, []);
  const edit = (partial: Partial<TrackTransitionConfig>) => {
    stop(); setError(null);
    const next = { ...config, ...partial };
    if (scope === 'pair' && key) setPairs(previous => ({ ...previous, [key]: next })); else setDefaults(next);
  };
  const move = (value: number) => { stop(); setError(null); setPairIndex(value); };
  const close = () => { stop(); onClose(); };
  const save = () => { stop(); onSave({ enabled, defaultConfig: defaults, customTransitions: pairs }); onClose(); };
  const source = async (track: Track, signal: AbortSignal) => {
    const local = getPlaybackTrack(track).streamUrl;
    return local || preparePlaybackSource(await resolveAudioStream(track.id, track.title, track.artists, { durationMs: track.durationMs, signal }), signal);
  };
  const listen = async () => {
    if (audition.current) { stop(); return; }
    if (!trackA || !trackB || !durationA || !durationB) return;
    const current = { controller: new AbortController(), players: [] as AudioPlayer[], timer: undefined as ReturnType<typeof setInterval> | undefined };
    audition.current = current; setError(null); setPreview('loading');
    const active = () => audition.current === current && !current.controller.signal.aborted;
    try {
      if (usePlayerStore.getState().isPlaying || usePlayerStore.getState().isLoading) await usePlayerStore.getState().togglePlayPause();
      const urls = await Promise.all([source(trackA, current.controller.signal), source(trackB, current.controller.signal)]);
      if (!active()) return;
      const a = createAudioPlayer({ uri: urls[0] }, { updateInterval: 100 }), b = createAudioPlayer({ uri: urls[1] }, { updateInterval: 100 });
      current.players = [a, b]; a.volume = 0; b.volume = 0;
      await Promise.all([waitForAudio(a, current.controller.signal), waitForAudio(b, current.controller.signal)]);
      if (!active()) return;
      tracePlayback('preview-start', { from: trackA.id, to: trackB.id, seconds: points.seconds });
      await Promise.all([nativeDeadline(a.seekTo(Math.max(0, points.out - 2)), 'preview-out'), nativeDeadline(b.seekTo(points.in), 'preview-in')]);
      if (!active()) return;
      a.volume = usePlayerStore.getState().volume; a.play(); setPreview('playing');
      let incoming = false, lastA = a.currentTime, lastB = b.currentTime, stalledTicks = 0;
      current.timer = setInterval(() => {
        if (!active()) return;
        const position = incoming ? b.currentTime : a.currentTime;
        stalledTicks = Math.abs(position - (incoming ? lastB : lastA)) > .01 ? 0 : stalledTicks + 1;
        lastA = a.currentTime; lastB = b.currentTime;
        if (stalledTicks > 120) { stop(); setError('A prévia parou de carregar. Tente novamente.'); return; }
        if (!incoming && a.currentTime >= points.out) { b.play(); incoming = true; stalledTicks = 0; }
        if (!incoming) return;
        const progress = (b.currentTime - points.in) / points.seconds;
        const gains = calculateCrossfadeFactors(progress, config.volume);
        const volume = usePlayerStore.getState().volume;
        a.volume = gains.outFactor * volume; b.volume = gains.inFactor * volume;
        if (progress >= 1) a.pause();
        if (b.currentTime >= points.in + points.seconds + 2) stop();
      }, 100);
    } catch (e) { if (active()) { stop(); setError(e instanceof Error ? e.message : 'Não foi possível ouvir a prévia.'); } }
  };
  const ranges = Array.from({ length: 24 }, (_, i) => calculateCrossfadeFactors(i / 23, config.volume));
  const customized = Object.keys(pairs).length;
  return <View style={s.container}>
    <View style={s.header}><View style={{ flex: 1 }}><Text style={s.title}>Transições</Text><Text style={s.muted} numberOfLines={1}>{playlist.name}</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Fechar transições" onPress={close} style={s.icon}><Ionicons name="close" size={24} color={colors.text} /></Pressable></View>
    <ScrollView contentContainerStyle={s.content}>
      <GlassCard style={s.card}><View style={s.row}><View style={{ flex: 1 }}><Text style={s.heading}>Misturar músicas</Text><Text style={s.description}>O fim de uma faixa encontra o começo da próxima.</Text></View><Switch accessibilityLabel="Misturar músicas nesta playlist" value={enabled} onValueChange={value => { stop(); setEnabled(value); }} trackColor={{ true: colors.accent, false: colors.border }} /></View></GlassCard>
      {playlist.tracks.length < 2 ? <Text style={s.description}>Adicione pelo menos duas músicas à playlist para misturar.</Text> : <>
        <View style={s.segment}>{(['playlist', 'pair'] as const).map(value => <Pressable key={value} accessibilityRole="tab" accessibilityState={{ selected: scope === value }} style={[s.segmentItem, scope === value && s.selected]} onPress={() => { stop(); setScope(value); setAdvanced(false); }}><Text style={s.label}>{value === 'playlist' ? 'Playlist inteira' : 'Por transição'}</Text></Pressable>)}</View>
        <View style={[s.editor, !enabled && { opacity: .45 }]} pointerEvents={enabled ? 'auto' : 'none'}>
          <View style={s.row}><Pressable accessibilityRole="button" accessibilityLabel="Par anterior" disabled={pairIndex <= 0} onPress={() => move(pairIndex - 1)} style={s.icon}><Ionicons name="chevron-back" size={22} color={pairIndex ? colors.text : colors.border} /></Pressable><View style={{ flex: 1 }}><Text style={s.kicker}>TRANSIÇÃO {pairIndex + 1} DE {playlist.tracks.length - 1}</Text><Text style={s.muted}>{scopeLabel}</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Próximo par" disabled={pairIndex >= playlist.tracks.length - 2} onPress={() => move(pairIndex + 1)} style={s.icon}><Ionicons name="chevron-forward" size={22} color={pairIndex < playlist.tracks.length - 2 ? colors.text : colors.border} /></Pressable></View>
          <View style={s.tracks}>{[trackA, trackB].map((track, index) => <View key={index} style={s.track}><Cover uri={track.coverUrl} seed={track.id} size={64} radius={12} /><Text style={s.label} numberOfLines={1}>{track.title}</Text><Text style={s.muted} numberOfLines={1}>{index ? 'Entrada' : 'Saída'} · {track.artists}</Text></View>)}</View>
          <View style={s.diagram} accessibilityLabel="Curvas de volume das duas músicas">{ranges.map((gain, i) => <View key={i} style={s.diagramColumn}><View style={{ height: gain.outFactor * 34 + 2, backgroundColor: '#83b5f4', borderRadius: 2 }} /><View style={{ height: gain.inFactor * 34 + 2, backgroundColor: colors.accent, borderRadius: 2 }} /></View>)}</View>
          <Text style={s.kicker}>ESTILO</Text><View style={s.segment}>{MIX_PRESETS.map(preset => <Pressable key={preset.id} accessibilityRole="button" accessibilityState={{ selected: config.preset === preset.id }} onPress={() => edit(mixPreset(preset.id))} style={[s.segmentItem, config.preset === preset.id && s.selected]}><Text style={s.label}>{preset.label}</Text></Pressable>)}</View>
          <Text style={s.description}>{MIX_PRESETS.find(p => p.id === config.preset)?.description || 'Transição personalizada.'}</Text>
          <View style={s.row}><Text style={s.heading}>Duração</Text><Text style={s.value}>{config.durationSeconds.toFixed(1)} s</Text></View><Slider accessibilityLabel="Duração da transição em segundos" minimumValue={1} maximumValue={12} step={.5} value={config.durationSeconds} onValueChange={value => edit({ durationSeconds: value, preset: 'custom' })} minimumTrackTintColor={colors.accent} maximumTrackTintColor={colors.border} thumbTintColor={colors.text} />
          <View style={s.row}><Text style={s.muted}>Rápida · 1 s</Text><Text style={s.muted}>Longa · 12 s</Text></View>
          <Pressable accessibilityRole="button" accessibilityLabel={preview === 'idle' ? 'Ouvir transição' : 'Parar prévia'} disabled={!durationA || !durationB} style={s.preview} onPress={() => void listen()}>{preview === 'loading' ? <ActivityIndicator color={colors.background} /> : <Ionicons name={preview === 'playing' ? 'stop' : 'play'} size={20} color={colors.background} />}<Text style={s.previewText}>{preview === 'loading' ? 'Carregando… toque para cancelar' : preview === 'playing' ? 'Parar prévia' : 'Ouvir transição'}</Text></Pressable>
          <Text style={s.muted}>A prévia pausa a música atual. Seus ajustes entram em vigor ao salvar.</Text>
          {error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
          {scope === 'pair' && <><Pressable accessibilityRole="button" accessibilityState={{ expanded: advanced }} style={s.row} onPress={() => setAdvanced(!advanced)}><Text style={s.heading}>Ajustar pontos de entrada e saída</Text><Ionicons name={advanced ? 'chevron-up' : 'chevron-down'} color={colors.muted} size={18} /></Pressable>{advanced && <View style={s.card}><Text style={s.label}>Começar a saída em {points.out.toFixed(1)} s</Text><Slider accessibilityLabel="Ponto de saída em segundos" minimumValue={0} maximumValue={Math.max(1, durationA - points.seconds)} step={.1} value={points.out} onValueChange={value => edit({ outPointSec: value, preset: 'custom' })} minimumTrackTintColor={colors.accent} /><Text style={s.label}>Entrar na próxima em {points.in.toFixed(1)} s</Text><Slider accessibilityLabel="Ponto de entrada em segundos" minimumValue={0} maximumValue={Math.max(1, durationB - points.seconds)} step={.1} value={points.in} onValueChange={value => edit({ inPointSec: value, preset: 'custom' })} minimumTrackTintColor={colors.accent} /></View>}<Pressable accessibilityRole="button" style={s.reset} onPress={() => { stop(); setPairs(previous => { const next = { ...previous }; delete next[key]; return next; }); }}><Text style={s.muted}>Usar o padrão da playlist neste par</Text></Pressable></>}
          {scope === 'playlist' && customized > 0 && <Pressable accessibilityRole="button" style={s.reset} onPress={() => { stop(); setPairs({}); }}><Text style={s.muted}>Aplicar este padrão às {customized} transições personalizadas</Text></Pressable>}
        </View>
      </>}
    </ScrollView><View style={s.footer}><Pressable accessibilityRole="button" onPress={save} style={s.save}><Text style={s.previewText}>Salvar transições</Text></Pressable></View>
  </View>;
}
const s = themedStyles(() => ({
 container: { flex: 1, backgroundColor: colors.background }, header: { flexDirection: 'row', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderColor: colors.border }, title: { color: colors.text, fontSize: 25, fontWeight: '800' }, muted: { color: colors.muted, fontSize: 12, lineHeight: 18 }, content: { padding: 20, paddingBottom: 32, gap: 20 }, card: { padding: 16, gap: 12 }, row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }, heading: { color: colors.text, fontSize: 15, fontWeight: '600', flexShrink: 1 }, description: { color: colors.muted, fontSize: 13, lineHeight: 20, marginTop: 5 }, label: { color: colors.text, fontSize: 13, fontWeight: '600' }, icon: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }, segment: { flexDirection: 'row', borderRadius: 14, padding: 4, gap: 4, backgroundColor: colors.surface }, segmentItem: { flex: 1, paddingVertical: 13, alignItems: 'center', borderRadius: 10 }, selected: { backgroundColor: colors.elevated, borderWidth: 1, borderColor: colors.accent }, editor: { gap: 18 }, kicker: { color: colors.accent, fontSize: 11, fontWeight: '700', letterSpacing: 1 }, tracks: { flexDirection: 'row', gap: 24 }, track: { flex: 1, minWidth: 0, gap: 7 }, diagram: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 94, padding: 12, backgroundColor: colors.surface, borderRadius: 14 }, diagramColumn: { flex: 1, gap: 4 }, value: { color: colors.accent, fontSize: 18, fontWeight: '700', fontVariant: ['tabular-nums'] }, preview: { minHeight: 50, borderRadius: 25, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 10, paddingHorizontal: 12 }, previewText: { color: colors.background, fontSize: 14, fontWeight: '700' }, error: { color: colors.danger, fontSize: 13 }, reset: { minHeight: 44, justifyContent: 'center' }, footer: { borderTopWidth: 1, borderColor: colors.border, padding: 16 }, save: { borderRadius: 25, backgroundColor: colors.accent, minHeight: 50, alignItems: 'center', justifyContent: 'center' },
}));

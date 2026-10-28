import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, Switch, Text, TextInput, View } from 'react-native';
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
import { mixFrame, barsToSeconds } from '../player/mixAutomation';
import { applyDeckTone } from '../player/nativeEffects';
import { audioManager } from '../player/audioManager';
import { MixTimeline } from './MixTimeline';
import { releasePlayer } from '../player/releasePlayer';
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
    current?.players.forEach(releasePlayer);
    setPreview('idle');
  };
  useEffect(() => () => {
    const current = audition.current; audition.current = null; current?.controller.abort();
    if (current?.timer) clearInterval(current.timer);
    current?.players.forEach(releasePlayer);
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
      await audioManager.init();
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
        const gains = mixFrame(progress, { volume: config.volume, eq: config.eq, effect: config.effect, amount: config.effectAmount, eqAmount: config.eqAmount, curves: config.curves });
        applyDeckTone(a.id, gains.outgoingTone); applyDeckTone(b.id, gains.incomingTone);
        const volume = usePlayerStore.getState().volume;
        a.volume = gains.out * volume; b.volume = gains.in * volume;
        if (progress >= 1) a.pause();
        if (b.currentTime >= points.in + points.seconds + 2) stop();
      }, 100);
    } catch (e) { if (active()) { stop(); setError(e instanceof Error ? e.message : 'Não foi possível ouvir a prévia.'); } }
  };
  const customized = Object.keys(pairs).length;
  return <View style={s.container}>
    <View style={s.header}><View style={{ flex: 1 }}><Text style={s.title}>Transições</Text><Text style={s.muted} numberOfLines={1}>{playlist.name}</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Fechar transições" onPress={close} style={s.icon}><Ionicons name="close" size={24} color={colors.text} /></Pressable></View>
    <ScrollView contentContainerStyle={s.content}>
      <GlassCard style={s.card}><View style={s.row}><View style={{ flex: 1 }}><Text style={s.heading}>Misturar músicas</Text><Text style={s.description}>O fim de uma faixa encontra o começo da próxima.</Text></View><Switch accessibilityLabel="Misturar músicas nesta playlist" value={enabled} onValueChange={value => { stop(); setEnabled(value); }} trackColor={{ true: colors.accent, false: colors.border }} /></View></GlassCard>
      {playlist.tracks.length < 2 ? <Text style={s.description}>Adicione pelo menos duas músicas à playlist para misturar.</Text> : <>
        <View style={s.segment}>{(['playlist', 'pair'] as const).map(value => <Pressable key={value} accessibilityRole="tab" accessibilityState={{ selected: scope === value }} style={[s.segmentItem, scope === value && s.selected]} onPress={() => { stop(); setScope(value); setAdvanced(false); }}><Text style={s.label}>{value === 'playlist' ? 'Playlist inteira' : 'Por transição'}</Text></Pressable>)}</View>
        <View style={[s.editor, !enabled && { opacity: .45 }]} pointerEvents={enabled ? 'auto' : 'none'}>
          <View style={s.row}><Pressable accessibilityRole="button" accessibilityLabel="Par anterior" disabled={pairIndex <= 0} onPress={() => move(pairIndex - 1)} style={s.icon}><Ionicons name="chevron-back" size={22} color={pairIndex ? colors.text : colors.border} /></Pressable><View style={{ flex: 1 }}><Text style={s.kicker}>TRANSIÇÃO {pairIndex + 1} DE {playlist.tracks.length - 1}</Text><Text style={s.muted}>{scopeLabel}</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Próximo par" disabled={pairIndex >= playlist.tracks.length - 2} onPress={() => move(pairIndex + 1)} style={s.icon}><Ionicons name="chevron-forward" size={22} color={pairIndex < playlist.tracks.length - 2 ? colors.text : colors.border} /></Pressable></View>
          <View style={s.row}><Cover uri={trackA.coverUrl} seed={trackA.id} size={48} radius={8} /><View style={{ flex: 1 }}><Text style={s.heading}>{trackA.title}</Text><Text style={s.muted}>{trackA.artists}</Text></View><Text style={s.muted}>Saída</Text></View>
          <View><MixTimeline key={trackA.id+'->'+trackB.id} a={trackA} b={trackB} seconds={points.seconds} out={points.out} cue={points.in} config={{ volume: config.volume, eq: config.eq, effect: config.effect, amount: config.effectAmount, eqAmount: config.eqAmount, curves: config.curves }} onChange={curves => edit({ curves, preset: 'custom' })} /><Pressable accessibilityLabel="Ouvir prévia no gráfico" onPress={() => void listen()} style={{ position: 'absolute', left: '44%', top: '39%', width: 44, height: 44, borderRadius: 22, backgroundColor: '#080c0e', alignItems: 'center', justifyContent: 'center' }}><Ionicons name={preview === 'idle' ? 'play' : 'stop'} size={20} color="white" /></Pressable></View>
          <View style={s.row}><Cover uri={trackB.coverUrl} seed={trackB.id} size={48} radius={8} /><View style={{ flex: 1 }}><Text style={s.heading}>{trackB.title}</Text><Text style={s.muted}>{trackB.artists}</Text></View><Text style={s.muted}>Entrada</Text></View>
          <View style={s.row}>
            <MixChoice label="Volume" value={config.volume} choices={VOLUMES} onChange={volume => edit({ volume: volume as TrackTransitionConfig['volume'], curves: undefined, preset: 'custom' })} />
            <MixChoice label="EQ" value={config.eq} choices={EQS} onChange={eq => edit({ eq: eq as TrackTransitionConfig['eq'], preset: 'custom' })} />
            <MixChoice label="Efeitos" value={config.effect} choices={EFFECTS} onChange={effect => edit({ effect: effect as TrackTransitionConfig['effect'], preset: 'custom' })} />
          </View>
          {config.eq !== 'none' && config.eq !== 'flat' && <View><Text style={s.label}>Redução de graves · {(config.eqAmount ?? 18).toFixed(0)} dB</Text><Slider minimumValue={0} maximumValue={24} step={1} value={config.eqAmount ?? 18} onValueChange={eqAmount => edit({ eqAmount, preset: 'custom' })} accessibilityLabel="Intensidade da troca de graves" minimumTrackTintColor={colors.accent} /></View>}
          {config.effect !== 'none' && <View><Text style={s.label}>Intensidade do efeito · {Math.round((config.effectAmount ?? .6) * 100)}%</Text><Slider minimumValue={0} maximumValue={1} step={.05} value={config.effectAmount ?? .6} onValueChange={effectAmount => edit({ effectAmount, preset: 'custom' })} accessibilityLabel="Intensidade do efeito de transição" minimumTrackTintColor={colors.accent} /></View>}
          <View style={s.row}><Text style={s.label}>BPM manual · 4/4</Text><TextInput key={config.bpm ?? 120} accessibilityLabel="BPM manual" defaultValue={String(config.bpm ?? 120)} keyboardType="number-pad" style={{ color: colors.text, borderColor: colors.border, borderWidth: 1, borderRadius: 8, padding: 10, minWidth: 70 }} onEndEditing={e => { const bpm = Math.max(40, Math.min(240, Number(e.nativeEvent.text) || 120)); edit({ bpm, ...(config.bars ? { durationSeconds: barsToSeconds(config.bars, bpm) } : {}) }); }} /></View>
          <View style={s.segment}>{([2, 4, 8, 16] as const).map(bars => <Pressable key={bars} style={[s.segmentItem, config.bars === bars && s.selected]} onPress={() => edit({ bars, durationSeconds: barsToSeconds(bars, config.bpm ?? 120), preset: 'custom' })}><Text style={s.label}>{bars} comp.</Text></Pressable>)}</View>
          <Text style={s.kicker}>ESTILO</Text><View style={[s.segment, { flexWrap: 'wrap' }]}>{MIX_PRESETS.map(preset => <Pressable key={preset.id} accessibilityRole="button" accessibilityState={{ selected: config.preset === preset.id }} onPress={() => edit(mixPreset(preset.id))} style={[s.segmentItem, config.preset === preset.id && s.selected]}><Text style={s.label}>{preset.label}</Text></Pressable>)}</View>
          <Text style={s.description}>{MIX_PRESETS.find(p => p.id === config.preset)?.description || 'Transição personalizada.'}</Text>
          <View style={s.row}><Text style={s.heading}>Duração</Text><Text style={s.value}>{points.seconds.toFixed(1)} s</Text></View><Slider accessibilityLabel="Duração da transição em segundos" minimumValue={1} maximumValue={Math.max(1, Math.min(96, durationA / 2, durationB / 2))} step={.5} value={points.seconds} onValueChange={value => edit({ durationSeconds: value, bars: undefined, preset: 'custom' })} minimumTrackTintColor={colors.accent} maximumTrackTintColor={colors.border} thumbTintColor={colors.text} />
          <View style={s.row}><Text style={s.muted}>Rápida · 1 s</Text><Text style={s.muted}>Longa · 96 s</Text></View>
          <Pressable accessibilityRole="button" accessibilityLabel={preview === 'idle' ? 'Ouvir transição' : 'Parar prévia'} disabled={!durationA || !durationB} style={s.preview} onPress={() => void listen()}>{preview === 'loading' ? <ActivityIndicator color={colors.background} /> : <Ionicons name={preview === 'playing' ? 'stop' : 'play'} size={20} color={colors.background} />}<Text style={s.previewText}>{preview === 'loading' ? 'Carregando… toque para cancelar' : preview === 'playing' ? 'Parar prévia' : 'Ouvir transição'}</Text></Pressable>
          <Pressable onPress={() => edit({ curves: undefined, preset: 'custom' })}><Text style={s.muted}>Restaurar curva de volume</Text></Pressable>
          <Text style={s.muted}>A prévia pausa a música atual. Seus ajustes entram em vigor ao salvar.</Text>
          {error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
          {scope === 'pair' && <><Pressable accessibilityRole="button" accessibilityState={{ expanded: advanced }} style={s.row} onPress={() => setAdvanced(!advanced)}><Text style={s.heading}>Ajustar pontos de entrada e saída</Text><Ionicons name={advanced ? 'chevron-up' : 'chevron-down'} color={colors.muted} size={18} /></Pressable>{advanced && <View style={s.card}><Text style={s.label}>Começar a saída em {points.out.toFixed(1)} s</Text><Slider accessibilityLabel="Ponto de saída em segundos" minimumValue={0} maximumValue={Math.max(1, durationA - points.seconds)} step={.1} value={points.out} onValueChange={value => edit({ outPointSec: value, preset: 'custom' })} minimumTrackTintColor={colors.accent} /><Text style={s.label}>Entrar na próxima em {points.in.toFixed(1)} s</Text><Slider accessibilityLabel="Ponto de entrada em segundos" minimumValue={0} maximumValue={Math.max(1, durationB - points.seconds)} step={.1} value={points.in} onValueChange={value => edit({ inPointSec: value, preset: 'custom' })} minimumTrackTintColor={colors.accent} /></View>}<Pressable accessibilityRole="button" style={s.reset} onPress={() => { stop(); setPairs(previous => { const next = { ...previous }; delete next[key]; return next; }); }}><Text style={s.muted}>Usar o padrão da playlist neste par</Text></Pressable></>}
          {scope === 'playlist' && customized > 0 && <Pressable accessibilityRole="button" style={s.reset} onPress={() => { stop(); setPairs({}); }}><Text style={s.muted}>Aplicar este padrão às {customized} transições personalizadas</Text></Pressable>}
        </View>
      </>}
    </ScrollView><View style={s.footer}><Pressable accessibilityRole="button" onPress={save} style={s.save}><Text style={s.previewText}>Salvar transições</Text></Pressable></View>
  </View>;
}

const VOLUMES = [['equal_power', 'Potência igual'], ['overlap', 'Sobrepor'], ['linear', 'Linear'], ['rise', 'Rise'], ['cut', 'Corte']];
const EQS = [['none', 'Sem EQ'], ['end_bass_swap', 'Graves no fim'], ['center_bass_swap', 'Graves ao centro'], ['early_bass_swap', 'Graves no início'], ['bass_cut', 'Cortar graves']];
const EFFECTS = [['none', 'Sem efeito'], ['low_pass', 'Passa-baixas'], ['high_pass', 'Passa-altas'], ['reverb', 'Reverb']];
function MixChoice({ label, value, choices, onChange }: { label: string; value: string; choices: string[][]; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  return <View style={{ flex: 1 }}><Pressable style={{ padding: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 10 }} onPress={() => setOpen(true)}><Text style={s.muted}>{label}</Text><Text style={s.label} numberOfLines={1}>{choices.find(c => c[0] === value)?.[1] || value}⌄</Text></Pressable><Modal transparent visible={open} animationType="fade" onRequestClose={() => setOpen(false)}><Pressable onPress={() => setOpen(false)} style={{ flex: 1, backgroundColor: '#0009', justifyContent: 'flex-end' }}><View style={{ backgroundColor: colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 }}><Text style={s.heading}>{label}</Text>{choices.map(([id, title]) => <Pressable key={id} style={{ paddingVertical: 18 }} onPress={() => { onChange(id); setOpen(false); }}><Text style={[s.label, value === id && { color: colors.accent }]}>{title}</Text></Pressable>)}</View></Pressable></Modal></View>;
}

const s = themedStyles(() => ({
 container: { flex: 1, backgroundColor: colors.background }, header: { flexDirection: 'row', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderColor: colors.border }, title: { color: colors.text, fontSize: 25, fontWeight: '800' }, muted: { color: colors.muted, fontSize: 12, lineHeight: 18 }, content: { padding: 20, paddingBottom: 32, gap: 20 }, card: { padding: 16, gap: 12 }, row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }, heading: { color: colors.text, fontSize: 15, fontWeight: '600', flexShrink: 1 }, description: { color: colors.muted, fontSize: 13, lineHeight: 20, marginTop: 5 }, label: { color: colors.text, fontSize: 13, fontWeight: '600' }, icon: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }, segment: { flexDirection: 'row', borderRadius: 14, padding: 4, gap: 4, backgroundColor: colors.surface }, segmentItem: { flex: 1, paddingVertical: 13, alignItems: 'center', borderRadius: 10 }, selected: { backgroundColor: colors.elevated, borderWidth: 1, borderColor: colors.accent }, editor: { gap: 18 }, kicker: { color: colors.accent, fontSize: 11, fontWeight: '700', letterSpacing: 1 }, tracks: { flexDirection: 'row', gap: 24 }, track: { flex: 1, minWidth: 0, gap: 7 }, diagram: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 94, padding: 12, backgroundColor: colors.surface, borderRadius: 14 }, diagramColumn: { flex: 1, gap: 4 }, value: { color: colors.accent, fontSize: 18, fontWeight: '700', fontVariant: ['tabular-nums'] }, preview: { minHeight: 50, borderRadius: 25, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 10, paddingHorizontal: 12 }, previewText: { color: colors.background, fontSize: 14, fontWeight: '700' }, error: { color: colors.danger, fontSize: 13 }, reset: { minHeight: 44, justifyContent: 'center' }, footer: { borderTopWidth: 1, borderColor: colors.border, padding: 16 }, save: { borderRadius: 25, backgroundColor: colors.accent, minHeight: 50, alignItems: 'center', justifyContent: 'center' },
}));

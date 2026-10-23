import React, { useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import type {
  MixEQType,
  MixEffectType,
  MixPreset,
  MixVolumeType,
  Playlist,
  PlaylistMixSettings,
  TrackTransitionConfig,
} from '../types';
import { colors } from '../theme';
import { Cover, IconButton } from '../screens/ScreenParts';
import { GlassCard } from './GlassCard';

interface PlaylistMixStudioProps {
  visible: boolean;
  playlist: Playlist;
  onClose: () => void;
  onSave: (settings: PlaylistMixSettings) => void;
}

const DEFAULT_CONFIG: TrackTransitionConfig = {
  durationSeconds: 4,
  volume: 'fade',
  eq: 'center_bass_swap',
  effect: 'none',
  preset: 'fade',
};

const DURATION_OPTIONS = [2, 4, 6, 8, 12, 16];

const VOLUME_OPTIONS: { id: MixVolumeType; label: string; desc: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { id: 'fade', label: 'Crossfade', desc: 'Fade suave entre o final e o início', icon: 'shuffle' },
  { id: 'overlap', label: 'Sobrepor', desc: 'Ambas as faixas tocam em volume total', icon: 'layers' },
  { id: 'cut', label: 'Corte rápido', desc: 'Troca instantânea no último tempo', icon: 'cut' },
];

const EQ_OPTIONS: { id: MixEQType; label: string; desc: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { id: 'center_bass_swap', label: 'Graves no centro', desc: 'Troca os graves no ponto médio exato', icon: 'options' },
  { id: 'end_bass_swap', label: 'Graves no final', desc: 'Corta graves de A e solta os graves de B', icon: 'swap-horizontal' },
  { id: 'flat', label: 'Graves planos', desc: 'Sem alteração nas frequências de graves', icon: 'remove' },
];

const EFFECT_OPTIONS: { id: MixEffectType; label: string; desc: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { id: 'none', label: 'Nenhum', desc: 'Áudio puro sem filtros', icon: 'close-circle-outline' },
  { id: 'echo', label: 'Eco / Delay', desc: 'Eco expansivo na saída da faixa', icon: 'radio' },
  { id: 'low_pass', label: 'Filtro passa-baixa', desc: 'Efeito abafado progressivo até o drop', icon: 'funnel' },
  { id: 'reverb', label: 'Reverberação', desc: 'Espaço e ambiente de clube na transição', icon: 'planet' },
];

const PRESETS: { id: MixPreset; label: string; config: Partial<TrackTransitionConfig> }[] = [
  { id: 'auto', label: 'Auto DJ', config: { durationSeconds: 6, volume: 'fade', eq: 'center_bass_swap', effect: 'low_pass' } },
  { id: 'fade', label: 'Fade clássico', config: { durationSeconds: 4, volume: 'fade', eq: 'flat', effect: 'none' } },
  { id: 'rise', label: 'Rise & Drop', config: { durationSeconds: 8, volume: 'overlap', eq: 'end_bass_swap', effect: 'echo' } },
  { id: 'blend', label: 'Blend profundo', config: { durationSeconds: 12, volume: 'fade', eq: 'center_bass_swap', effect: 'reverb' } },
];

export function PlaylistMixStudio({ visible, playlist, onClose, onSave }: PlaylistMixStudioProps) {
  const tracks = playlist.tracks;
  const initialSettings = useMemo<PlaylistMixSettings>(() => {
    return playlist.mixSettings || {
      enabled: true,
      defaultConfig: DEFAULT_CONFIG,
      customTransitions: {},
    };
  }, [playlist.mixSettings]);

  const [enabled, setEnabled] = useState(initialSettings.enabled);
  const [defaultConfig, setDefaultConfig] = useState<TrackTransitionConfig>(initialSettings.defaultConfig || DEFAULT_CONFIG);
  const [customTransitions, setCustomTransitions] = useState<Record<string, TrackTransitionConfig>>(initialSettings.customTransitions || {});
  const [pairIndex, setPairIndex] = useState(0);
  const [previewPlaying, setPreviewPlaying] = useState(false);

  const numTransitions = Math.max(0, tracks.length - 1);
  const safePairIndex = Math.min(pairIndex, Math.max(0, numTransitions - 1));
  const trackA = tracks[safePairIndex];
  const trackB = tracks[safePairIndex + 1];
  const pairKey = trackA && trackB ? `${trackA.id}->${trackB.id}` : '';
  const currentConfig = (pairKey && customTransitions[pairKey]) || defaultConfig;

  const updateCurrentConfig = (partial: Partial<TrackTransitionConfig>) => {
    const updated = { ...currentConfig, ...partial };
    if (pairKey) {
      setCustomTransitions(prev => ({ ...prev, [pairKey]: updated }));
    } else {
      setDefaultConfig(updated);
    }
  };

  const applyPreset = (preset: MixPreset) => {
    const found = PRESETS.find(p => p.id === preset);
    if (!found) return;
    updateCurrentConfig({ ...found.config, preset });
  };

  const applyToAll = () => {
    setDefaultConfig(currentConfig);
    setCustomTransitions({});
  };

  const handleSave = () => {
    onSave({
      enabled,
      defaultConfig,
      customTransitions,
    });
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={s.container}>
        {/* Header */}
        <View style={s.header}>
          <IconButton name="close" label="Fechar estúdio de mixagem" onPress={onClose} />
          <View style={s.headerTitles}>
            <Text style={s.headerTitle}>Estúdio de Mixagem</Text>
            <Text style={s.headerSubtitle} numberOfLines={1}>{playlist.name}</Text>
          </View>
          <Pressable accessibilityRole="button" onPress={handleSave} style={s.saveButton}>
            <Text style={s.saveButtonText}>Pronto</Text>
          </Pressable>
        </View>

        <ScrollView style={s.scroll} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
          {/* Main Activation Switch */}
          <GlassCard style={s.switchCard}>
            <View style={s.switchInfo}>
              <View style={s.switchIconWrap}>
                <Ionicons name="git-merge-outline" size={22} color={colors.accent} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={s.switchTitle}>Mixagem inteligente ativa</Text>
                <Text style={s.switchDesc}>Conecta as músicas desta playlist sem pausas ou silêncios</Text>
              </View>
            </View>
            <Switch
              accessibilityLabel="Ativar mixagem nesta playlist"
              value={enabled}
              onValueChange={setEnabled}
              trackColor={{ false: colors.elevated, true: '#237b69' }}
              thumbColor={enabled ? colors.accent : colors.muted}
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
              <View style={s.pairNav}>
                <IconButton
                  name="chevron-back"
                  label="Transição anterior"
                  disabled={safePairIndex <= 0}
                  onPress={() => setPairIndex(p => Math.max(0, p - 1))}
                />
                <View style={s.pairCenter}>
                  <Text style={s.pairCounter}>TRANSIÇÃO {safePairIndex + 1} DE {numTransitions}</Text>
                  <View style={s.pairTracksRow}>
                    <Text style={s.pairTrackName} numberOfLines={1}>{trackA?.title || 'Faixa A'}</Text>
                    <Ionicons name="arrow-forward" size={14} color={colors.accent} style={{ marginHorizontal: 6 }} />
                    <Text style={s.pairTrackName} numberOfLines={1}>{trackB?.title || 'Faixa B'}</Text>
                  </View>
                </View>
                <IconButton
                  name="chevron-forward"
                  label="Próxima transição"
                  disabled={safePairIndex >= numTransitions - 1}
                  onPress={() => setPairIndex(p => Math.min(numTransitions - 1, p + 1))}
                />
              </View>

              {/* Dual Waveform Visualizer Card */}
              <GlassCard style={s.waveformCard}>
                <View style={s.waveformHeader}>
                  <View style={s.waveformTag}>
                    <View style={[s.indicatorDot, { backgroundColor: colors.accent }]} />
                    <Text style={s.waveformLabel}>Música saindo: {trackA?.title}</Text>
                  </View>
                  <View style={s.durationBadge}>
                    <Ionicons name="time-outline" size={12} color={colors.accent} />
                    <Text style={s.durationBadgeText}>{currentConfig.durationSeconds}s</Text>
                  </View>
                </View>

                {/* Track A Waveform (Cyan/Outgoing) */}
                <View style={s.waveTrack}>
                  <View style={s.waveCoverWrap}>
                    <Cover uri={trackA?.coverUrl} size={32} icon="musical-note" />
                  </View>
                  <View style={s.barsContainer}>
                    {[40, 55, 70, 85, 95, 80, 65, 50, 45, 30, 20, 10, 5].map((h, i) => (
                      <View
                        key={`wa-${i}`}
                        style={[
                          s.waveBar,
                          { height: `${h}%`, backgroundColor: i > 7 ? '#2dd4bf66' : colors.accent },
                        ]}
                      />
                    ))}
                  </View>
                </View>

                {/* Automation Transition Curve Line */}
                <View style={s.automationCurveWrap}>
                  <LinearGradient
                    colors={['#2dd4bf88', '#a855f788']}
                    start={{ x: 0, y: 0.5 }}
                    end={{ x: 1, y: 0.5 }}
                    style={s.automationLine}
                  />
                  <View style={s.curveOverlay}>
                    <Text style={s.curveInfoText}>
                      Curva: {currentConfig.volume.toUpperCase()} · EQ: {currentConfig.eq.replace(/_/g, ' ')}
                    </Text>
                  </View>
                </View>

                {/* Track B Waveform (Purple/Incoming) */}
                <View style={s.waveTrack}>
                  <View style={s.waveCoverWrap}>
                    <Cover uri={trackB?.coverUrl} size={32} icon="musical-note" />
                  </View>
                  <View style={s.barsContainer}>
                    {[5, 12, 25, 45, 60, 75, 90, 85, 95, 90, 75, 60, 50].map((h, i) => (
                      <View
                        key={`wb-${i}`}
                        style={[
                          s.waveBar,
                          { height: `${h}%`, backgroundColor: i < 5 ? '#c084fc66' : '#a855f7' },
                        ]}
                      />
                    ))}
                  </View>
                </View>

                <View style={s.waveformFooter}>
                  <View style={s.waveformTag}>
                    <View style={[s.indicatorDot, { backgroundColor: '#a855f7' }]} />
                    <Text style={s.waveformLabel}>Música entrando: {trackB?.title}</Text>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    style={s.previewButton}
                    onPress={() => setPreviewPlaying(v => !v)}
                  >
                    <Ionicons name={previewPlaying ? 'pause' : 'play'} size={14} color="#000" />
                    <Text style={s.previewButtonText}>{previewPlaying ? 'Pausar' : 'Prévia'}</Text>
                  </Pressable>
                </View>
              </GlassCard>

              {/* Presets Row */}
              <View style={s.sectionHeader}>
                <Text style={s.sectionTitle}>PRESETS RÁPIDOS</Text>
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
                        size={14}
                        color={active ? '#000' : colors.accent}
                      />
                      <Text style={[s.presetChipText, active && s.presetChipTextActive]}>
                        {preset.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>

              {/* Duration selector */}
              <View style={s.sectionHeader}>
                <Text style={s.sectionTitle}>TEMPO DE TRANSIÇÃO</Text>
                <Text style={s.sectionValue}>{currentConfig.durationSeconds} segundos</Text>
              </View>
              <View style={s.pillRow}>
                {DURATION_OPTIONS.map(sec => (
                  <Pressable
                    key={sec}
                    style={[s.pill, currentConfig.durationSeconds === sec && s.pillActive]}
                    onPress={() => updateCurrentConfig({ durationSeconds: sec })}
                  >
                    <Text style={[s.pillText, currentConfig.durationSeconds === sec && s.pillTextActive]}>
                      {sec}s
                    </Text>
                  </Pressable>
                ))}
              </View>

              {/* Volume Behavior */}
              <View style={s.sectionHeader}>
                <Text style={s.sectionTitle}>CURVA DE VOLUME</Text>
              </View>
              <View style={s.optionsList}>
                {VOLUME_OPTIONS.map(opt => {
                  const selected = currentConfig.volume === opt.id;
                  return (
                    <Pressable
                      key={opt.id}
                      style={[s.optionCard, selected && s.optionCardSelected]}
                      onPress={() => updateCurrentConfig({ volume: opt.id })}
                    >
                      <View style={[s.optionIconWrap, selected && s.optionIconWrapSelected]}>
                        <Ionicons name={opt.icon} size={18} color={selected ? colors.accent : colors.muted} />
                      </View>
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text style={[s.optionName, selected && { color: colors.text }]}>{opt.label}</Text>
                        <Text style={s.optionDesc}>{opt.desc}</Text>
                      </View>
                      <View style={[s.radioCircle, selected && s.radioCircleSelected]}>
                        {selected && <View style={s.radioDot} />}
                      </View>
                    </Pressable>
                  );
                })}
              </View>

              {/* EQ / Bass options */}
              <View style={s.sectionHeader}>
                <Text style={s.sectionTitle}>TROCA DE GRAVES (EQ)</Text>
              </View>
              <View style={s.optionsList}>
                {EQ_OPTIONS.map(opt => {
                  const selected = currentConfig.eq === opt.id;
                  return (
                    <Pressable
                      key={opt.id}
                      style={[s.optionCard, selected && s.optionCardSelected]}
                      onPress={() => updateCurrentConfig({ eq: opt.id })}
                    >
                      <View style={[s.optionIconWrap, selected && s.optionIconWrapSelected]}>
                        <Ionicons name={opt.icon} size={18} color={selected ? colors.accent : colors.muted} />
                      </View>
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text style={[s.optionName, selected && { color: colors.text }]}>{opt.label}</Text>
                        <Text style={s.optionDesc}>{opt.desc}</Text>
                      </View>
                      <View style={[s.radioCircle, selected && s.radioCircleSelected]}>
                        {selected && <View style={s.radioDot} />}
                      </View>
                    </Pressable>
                  );
                })}
              </View>

              {/* Transition Effects */}
              <View style={s.sectionHeader}>
                <Text style={s.sectionTitle}>EFEITOS DE TRANSIÇÃO</Text>
              </View>
              <View style={s.optionsList}>
                {EFFECT_OPTIONS.map(opt => {
                  const selected = currentConfig.effect === opt.id;
                  return (
                    <Pressable
                      key={opt.id}
                      style={[s.optionCard, selected && s.optionCardSelected]}
                      onPress={() => updateCurrentConfig({ effect: opt.id })}
                    >
                      <View style={[s.optionIconWrap, selected && s.optionIconWrapSelected]}>
                        <Ionicons name={opt.icon} size={18} color={selected ? colors.accent : colors.muted} />
                      </View>
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text style={[s.optionName, selected && { color: colors.text }]}>{opt.label}</Text>
                        <Text style={s.optionDesc}>{opt.desc}</Text>
                      </View>
                      <View style={[s.radioCircle, selected && s.radioCircleSelected]}>
                        {selected && <View style={s.radioDot} />}
                      </View>
                    </Pressable>
                  );
                })}
              </View>

              {/* Apply to all button */}
              <Pressable accessibilityRole="button" style={s.applyAllBtn} onPress={applyToAll}>
                <Ionicons name="copy-outline" size={16} color={colors.accent} />
                <Text style={s.applyAllText}>Aplicar esta configuração para todas as músicas</Text>
              </Pressable>
            </>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitles: { flex: 1, alignItems: 'center', marginHorizontal: 8 },
  headerTitle: { color: colors.text, fontSize: 16, fontWeight: '700' },
  headerSubtitle: { color: colors.muted, fontSize: 12 },
  saveButton: {
    backgroundColor: colors.accent,
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 20,
  },
  saveButtonText: { color: '#000', fontSize: 13, fontWeight: '700' },
  scroll: { flex: 1 },
  content: { padding: 18, gap: 16, paddingBottom: 40 },
  switchCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderRadius: 18,
  },
  switchInfo: { flexDirection: 'row', alignItems: 'center', flex: 1, gap: 12, marginRight: 10 },
  switchIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#2dd4bf22',
    alignItems: 'center',
    justifyContent: 'center',
  },
  switchTitle: { color: colors.text, fontSize: 15, fontWeight: '700' },
  switchDesc: { color: colors.muted, fontSize: 12, lineHeight: 16 },
  emptyBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    gap: 12,
    paddingHorizontal: 24,
  },
  emptyTitle: { color: colors.text, fontSize: 18, fontWeight: '700' },
  emptyDesc: { color: colors.muted, fontSize: 13, textAlign: 'center', lineHeight: 19 },
  pairNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 16,
  },
  pairCenter: { flex: 1, alignItems: 'center', paddingHorizontal: 8 },
  pairCounter: { color: colors.accent, fontSize: 10, fontWeight: '800', letterSpacing: 1.5, marginBottom: 4 },
  pairTracksRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  pairTrackName: { color: colors.text, fontSize: 13, fontWeight: '600', maxWidth: 120 },
  waveformCard: {
    padding: 16,
    borderRadius: 20,
    gap: 12,
  },
  waveformHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  waveformFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  waveformTag: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 },
  indicatorDot: { width: 8, height: 8, borderRadius: 4 },
  waveformLabel: { color: colors.text, fontSize: 12, fontWeight: '600' },
  durationBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#2dd4bf22',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  durationBadgeText: { color: colors.accent, fontSize: 11, fontWeight: '700' },
  waveTrack: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 42 },
  waveCoverWrap: { width: 32, height: 32, borderRadius: 6, overflow: 'hidden' },
  barsContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: '100%',
  },
  waveBar: {
    width: 4,
    borderRadius: 2,
    minHeight: 4,
  },
  automationCurveWrap: {
    height: 20,
    justifyContent: 'center',
    position: 'relative',
    marginVertical: 4,
  },
  automationLine: { height: 3, borderRadius: 2, width: '100%' },
  curveOverlay: { position: 'absolute', right: 0, top: -8 },
  curveInfoText: { color: colors.muted, fontSize: 9, fontWeight: '700', letterSpacing: 0.5 },
  previewButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.accent,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 14,
  },
  previewButtonText: { color: '#000', fontSize: 12, fontWeight: '700' },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 4,
  },
  sectionTitle: { color: colors.muted, fontSize: 11, fontWeight: '800', letterSpacing: 1.2 },
  sectionValue: { color: colors.accent, fontSize: 12, fontWeight: '600' },
  presetsRow: { gap: 8, paddingVertical: 4 },
  presetChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  presetChipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  presetChipText: { color: colors.text, fontSize: 12, fontWeight: '600' },
  presetChipTextActive: { color: '#000', fontWeight: '700' },
  pillRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  pill: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pillActive: { backgroundColor: '#2dd4bf28', borderColor: colors.accent },
  pillText: { color: colors.muted, fontSize: 13, fontWeight: '600' },
  pillTextActive: { color: colors.accent, fontWeight: '700' },
  optionsList: { gap: 8 },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 12,
  },
  optionCardSelected: { borderColor: colors.accent, backgroundColor: '#162b29' },
  optionIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: colors.elevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionIconWrapSelected: { backgroundColor: '#2dd4bf28' },
  optionName: { color: colors.text, fontSize: 14, fontWeight: '600' },
  optionDesc: { color: colors.muted, fontSize: 12 },
  radioCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioCircleSelected: { borderColor: colors.accent },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.accent },
  applyAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: 8,
  },
  applyAllText: { color: colors.accent, fontSize: 13, fontWeight: '700' },
});

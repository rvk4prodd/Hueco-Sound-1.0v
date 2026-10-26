import React from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import Slider from '@react-native-community/slider';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme';
import { EQ_PRESETS, useAudioFXStore } from '../preferences/audioFX';
import { GlassCard } from './GlassCard';

interface Props {
  visible: boolean;
  onClose: () => void;
}

export function AudioFXRackModal({ visible, onClose }: Props) {
  const audioFX = useAudioFXStore((s) => s.audioFX);
  const setAudioFXEnabled = useAudioFXStore((s) => s.setAudioFXEnabled);
  const setEQPreset = useAudioFXStore((s) => s.setEQPreset);
  const setEQBandGain = useAudioFXStore((s) => s.setEQBandGain);
  const setCompressor = useAudioFXStore((s) => s.setCompressor);
  const setStereoWidth = useAudioFXStore((s) => s.setStereoWidth);

  const presets = Object.keys(EQ_PRESETS) as (keyof typeof EQ_PRESETS)[];

  const presetLabels: Record<string, string> = {
    flat: 'Flat',
    bass_boost: 'Bass Boost',
    treble_boost: 'Treble Boost',
    vocal_pop: 'Vocal Pop',
    electronic: 'Eletrônica / Phonk',
    acoustic: 'Acústico',
    rock: 'Rock',
    lofi: 'Lo-Fi Chill',
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={s.container}>
        {/* Header */}
        <View style={s.header}>
          <View>
            <Text style={s.title}>Audio FX Rack</Text>
            <Text style={s.subtitle}>Equalizador paramétrico & processamento dinâmico</Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Fechar" onPress={onClose} style={s.closeBtn}>
            <Ionicons name="close" size={24} color={colors.text} />
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
          {/* Master Enable */}
          <GlassCard style={s.card}>
            <View style={s.rowBetween}>
              <View>
                <Text style={s.cardTitle}>Processamento Ativo</Text>
                <Text style={s.cardDesc}>Aplica EQ, compressão e expansão estéreo</Text>
              </View>
              <Switch
                value={audioFX.enabled}
                onValueChange={setAudioFXEnabled}
                trackColor={{ false: colors.elevated, true: '#237b69' }}
                thumbColor={audioFX.enabled ? colors.accent : colors.muted}
              />
            </View>
          </GlassCard>

          {/* Equalizer Section */}
          <View style={s.sectionHeader}>
            <Text style={s.sectionTitle}>EQUALIZADOR 5 BANDAS</Text>
            <Text style={s.presetIndicator}>
              {audioFX.preset === 'custom' ? 'Personalizado' : presetLabels[audioFX.preset] || 'Flat'}
            </Text>
          </View>

          {/* Presets Row */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.presetsList}>
            {presets.map((pr) => {
              const active = audioFX.preset === pr;
              return (
                <Pressable
                  key={pr}
                  accessibilityRole="button"
                  onPress={() => setEQPreset(pr as any)}
                  style={[s.presetChip, active && s.presetChipActive]}
                >
                  <Text style={[s.presetChipText, active && s.presetChipTextActive]}>
                    {presetLabels[pr]}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {/* 5 Vertical Band Sliders */}
          <GlassCard style={s.eqRack}>
            <View style={s.bandsContainer}>
              {audioFX.bands.map((band) => (
                <View key={band.id} style={s.bandColumn}>
                  <Text style={s.gainValue}>
                    {band.gainDb > 0 ? `+${band.gainDb.toFixed(1)}` : band.gainDb.toFixed(1)} dB
                  </Text>
                  <View style={s.sliderTrack}>
                    <Slider
                      style={{ width: 140, height: 40, transform: [{ rotate: '-90deg' }] }}
                      minimumValue={-12}
                      maximumValue={12}
                      step={0.5}
                      value={band.gainDb}
                      onValueChange={(val) => setEQBandGain(band.id, val)}
                      minimumTrackTintColor={colors.accent}
                      maximumTrackTintColor="rgba(255,255,255,0.12)"
                      thumbTintColor={colors.accent}
                    />
                  </View>
                  <Text style={s.bandFreq}>{band.label}</Text>
                </View>
              ))}
            </View>
          </GlassCard>

          {/* Dynamics & Stereo Width Section */}
          <View style={s.sectionHeader}>
            <Text style={s.sectionTitle}>DINÂMICA & ESPACIALIDADE</Text>
          </View>

          {/* Compressor Card */}
          <GlassCard style={s.card}>
            <View style={s.rowBetween}>
              <View>
                <Text style={s.cardTitle}>Compressor / Punch</Text>
                <Text style={s.cardDesc}>Controla picos de volume e dá pegada aos graves</Text>
              </View>
              <Switch
                value={audioFX.compressorEnabled}
                onValueChange={(val) => setCompressor(val)}
                trackColor={{ false: colors.elevated, true: '#237b69' }}
                thumbColor={audioFX.compressorEnabled ? colors.accent : colors.muted}
              />
            </View>
            {audioFX.compressorEnabled && (
              <View style={{ marginTop: 14 }}>
                <View style={s.rowBetween}>
                  <Text style={s.paramLabel}>Threshold</Text>
                  <Text style={s.paramValue}>{audioFX.compressorThreshold} dB</Text>
                </View>
                <Slider
                  minimumValue={-36}
                  maximumValue={0}
                  step={1}
                  value={audioFX.compressorThreshold}
                  onValueChange={(v) => setCompressor(true, v)}
                  minimumTrackTintColor={colors.accent}
                  maximumTrackTintColor="rgba(255,255,255,0.15)"
                  thumbTintColor={colors.accent}
                />
              </View>
            )}
          </GlassCard>

          {/* Stereo Width Card */}
          <GlassCard style={s.card}>
            <View style={s.rowBetween}>
              <Text style={s.cardTitle}>Stereo Width / Virtualizer</Text>
              <Text style={s.paramValue}>{audioFX.stereoWidth}%</Text>
            </View>
            <Text style={[s.cardDesc, { marginBottom: 10 }]}>
              {audioFX.stereoWidth < 80
                ? 'Foco mono estreito'
                : audioFX.stereoWidth <= 120
                ? 'Estéreo natural de estúdio'
                : 'Palco sonoro ultra-aberto 3D'}
            </Text>
            <Slider
              minimumValue={0}
              maximumValue={200}
              step={5}
              value={audioFX.stereoWidth}
              onValueChange={setStereoWidth}
              minimumTrackTintColor={colors.accent}
              maximumTrackTintColor="rgba(255,255,255,0.15)"
              thumbTintColor={colors.accent}
            />
          </GlassCard>
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
  title: { color: colors.text, fontSize: 22, fontWeight: '800' },
  subtitle: { color: colors.muted, fontSize: 12, marginTop: 2 },
  closeBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  scroll: { padding: 18, paddingBottom: 60 },
  card: { padding: 16, marginBottom: 14 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { color: colors.text, fontSize: 15, fontWeight: '700' },
  cardDesc: { color: colors.muted, fontSize: 12, marginTop: 3 },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
    marginBottom: 10,
    paddingHorizontal: 4,
  },
  sectionTitle: { color: colors.muted, fontSize: 11, fontWeight: '800', letterSpacing: 1.5 },
  presetIndicator: { color: colors.accent, fontSize: 11, fontWeight: '700' },
  presetsList: { gap: 8, paddingBottom: 12 },
  presetChip: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  presetChipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  presetChipText: { color: colors.muted, fontSize: 12, fontWeight: '600' },
  presetChipTextActive: { color: '#000', fontWeight: '800' },
  eqRack: { paddingVertical: 20, paddingHorizontal: 10, marginBottom: 14 },
  bandsContainer: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', height: 210 },
  bandColumn: { alignItems: 'center', width: 56, height: '100%', justifyContent: 'space-between' },
  gainValue: { color: colors.accent, fontSize: 11, fontWeight: '700' },
  sliderTrack: { height: 140, width: 40, justifyContent: 'center', alignItems: 'center' },
  bandFreq: { color: colors.muted, fontSize: 11, fontWeight: '600' },
  paramLabel: { color: colors.text, fontSize: 12 },
  paramValue: { color: colors.accent, fontSize: 12, fontWeight: '700' },
});

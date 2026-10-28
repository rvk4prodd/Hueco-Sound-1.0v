import React, { useEffect } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  Switch,
  Text,
  View,
} from 'react-native';
import Slider from '@react-native-community/slider';
import { Ionicons } from '@expo/vector-icons';
import { colors, themedStyles, useHuecoTheme } from '../theme';
import { useAudioFXStore } from '../preferences/audioFX';
import { audioManager } from '../player/audioManager';
import { GlassCard } from './GlassCard';
import type { SlowedReverbPreset } from '../types';

interface Props {
  visible: boolean;
  onClose: () => void;
}

export function SlowedReverbModal({ visible, onClose }: Props) {
 useHuecoTheme();
  const slowedReverb = useAudioFXStore((s) => s.slowedReverb);
  const applyPreset = useAudioFXStore((s) => s.applySlowedReverbPreset);
  const setSpeed = useAudioFXStore((s) => s.setSlowedSpeed);
  const setReverb = useAudioFXStore((s) => s.setReverbLevel);
  const setPitch = useAudioFXStore((s) => s.setPitchSemitones);
  const setIsPitchLinked = useAudioFXStore((s) => s.setIsPitchLinked);
  const toggleSlowedReverb = useAudioFXStore((s) => s.toggleSlowedReverb);

  // Sync to native audio manager whenever state changes
  useEffect(() => {
    if (slowedReverb.enabled) {
      audioManager.setSlowedReverb(slowedReverb.speed, slowedReverb.reverbLevel);
    } else {
      audioManager.setSlowedReverb(1.0, 0.0);
    }
  }, [slowedReverb.enabled, slowedReverb.speed, slowedReverb.reverbLevel]);

  const presets: { id: SlowedReverbPreset; label: string; desc: string; icon: keyof typeof Ionicons.glyphMap }[] = [
    { id: 'slowed_reverb', label: 'Slowed + Reverb', desc: '0.85x com reverberação quente e grave encorpado', icon: 'water' },
    { id: 'ultra_slowed', label: 'Vaporwave Ultra Slow', desc: '0.78x atmosférico com reverb estilo catedral', icon: 'planet' },
    { id: 'sped_up', label: 'Sped Up', desc: '1.25x acelerado com batida enérgica e punch seco', icon: 'flash' },
    { id: 'nightcore', label: 'Nightcore', desc: '1.35x com tom agudo clássico e reverb de estúdio', icon: 'sparkles' },
    { id: 'hall', label: 'Cathedral Hall', desc: 'Velocidade normal (1.0x) com acústica imersiva', icon: 'radio' },
  ];

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={s.container}>
        {/* Header */}
        <View style={s.header}>
          <View>
            <Text style={s.title}>Slowed + Reverb Studio</Text>
            <Text style={s.subtitle}>Efeitos de velocidade, tom e reverberação espacial</Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Fechar" onPress={onClose} style={s.closeBtn}>
            <Ionicons name="close" size={24} color={colors.text} />
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
          {/* Master Toggle */}
          <GlassCard style={s.card}>
            <View style={s.rowBetween}>
              <View>
                <Text style={s.cardTitle}>Efeito Ativo</Text>
                <Text style={s.cardDesc}>Aplica desaceleração, pitch e acústica de reverb</Text>
              </View>
              <Switch
                value={slowedReverb.enabled}
                onValueChange={(val) => {
                  toggleSlowedReverb(val);
                  if (val && slowedReverb.preset === 'none') {
                    applyPreset('slowed_reverb');
                  }
                }}
                trackColor={{ false: colors.elevated, true: '#237b69' }}
                thumbColor={slowedReverb.enabled ? colors.accent : colors.muted}
              />
            </View>
          </GlassCard>

          {/* Quick Presets Section */}
          <Text style={s.sectionTitle}>PRESETS INSTANTÂNEOS</Text>
          <View style={s.presetsGrid}>
            {presets.map((p) => {
              const active = slowedReverb.enabled && slowedReverb.preset === p.id;
              return (
                <Pressable
                  key={p.id}
                  accessibilityRole="button"
                  onPress={() => applyPreset(p.id)}
                  style={({ pressed }) => [s.presetCard, active && s.presetCardActive, pressed && { opacity: 0.7 }]}
                >
                  <View style={s.presetIconRow}>
                    <Ionicons name={p.icon} size={20} color={active ? '#000' : colors.accent} />
                    {active && <Text style={s.activeBadge}>ATIVO</Text>}
                  </View>
                  <Text style={[s.presetName, active && s.presetNameActive]}>{p.label}</Text>
                  <Text style={[s.presetDesc, active && s.presetDescActive]}>{p.desc}</Text>
                </Pressable>
              );
            })}
          </View>

          {/* Custom Sliders Section */}
          <Text style={s.sectionTitle}>CONTROLES PERSONALIZADOS</Text>

          {/* Speed Slider */}
          <GlassCard style={s.card}>
            <View style={s.rowBetween}>
              <Text style={s.sliderLabel}>Velocidade de Reprodução</Text>
              <Text style={s.sliderValue}>{slowedReverb.speed.toFixed(2)}x</Text>
            </View>
            <Slider
              minimumValue={0.5}
              maximumValue={2.0}
              step={0.05}
              value={slowedReverb.speed}
              onValueChange={setSpeed}
              minimumTrackTintColor={colors.accent}
              maximumTrackTintColor="rgba(255,255,255,0.15)"
              thumbTintColor={colors.accent}
            />
            <View style={s.scaleRow}>
              <Text style={s.scaleMark}>0.5x (Super Lento)</Text>
              <Text style={s.scaleMark}>1.0x (Normal)</Text>
              <Text style={s.scaleMark}>2.0x (Turbo)</Text>
            </View>
          </GlassCard>

          {/* Reverb Level Slider */}
          <GlassCard style={s.card}>
            <View style={s.rowBetween}>
              <Text style={s.sliderLabel}>Intensidade do Reverb</Text>
              <Text style={s.sliderValue}>{Math.round(slowedReverb.reverbLevel * 100)}%</Text>
            </View>
            <Slider
              minimumValue={0.0}
              maximumValue={1.0}
              step={0.05}
              value={slowedReverb.reverbLevel}
              onValueChange={setReverb}
              minimumTrackTintColor={colors.accent}
              maximumTrackTintColor="rgba(255,255,255,0.15)"
              thumbTintColor={colors.accent}
            />
            <View style={s.scaleRow}>
              <Text style={s.scaleMark}>0% (Seco)</Text>
              <Text style={s.scaleMark}>50% (Sala Média)</Text>
              <Text style={s.scaleMark}>100% (Catedral)</Text>
            </View>
          </GlassCard>

          {/* Pitch Shift Slider */}
          <GlassCard style={s.card}>
            <View style={s.rowBetween}>
              <View>
                <Text style={s.sliderLabel}>Tom / Pitch</Text>
                <Text style={s.cardDesc}>
                  {slowedReverb.isPitchLinked
                    ? 'Vinculado automaticamente à velocidade (efeito fita/vinil)'
                    : 'Ajuste livre de semitons independente da velocidade'}
                </Text>
              </View>
              <Text style={s.sliderValue}>
                {slowedReverb.pitchSemitones > 0 ? `+${slowedReverb.pitchSemitones}` : slowedReverb.pitchSemitones} st
              </Text>
            </View>
            <View style={[s.rowBetween, { marginVertical: 10 }]}>
              <Text style={s.paramLabel}>Vincular tom à velocidade</Text>
              <Switch
                value={slowedReverb.isPitchLinked}
                onValueChange={setIsPitchLinked}
                trackColor={{ false: colors.elevated, true: '#237b69' }}
                thumbColor={slowedReverb.isPitchLinked ? colors.accent : colors.muted}
              />
            </View>
            {!slowedReverb.isPitchLinked && (
              <Slider
                minimumValue={-12}
                maximumValue={12}
                step={0.5}
                value={slowedReverb.pitchSemitones}
                onValueChange={setPitch}
                minimumTrackTintColor={colors.accent}
                maximumTrackTintColor="rgba(255,255,255,0.15)"
                thumbTintColor={colors.accent}
              />
            )}
          </GlassCard>
        </ScrollView>
      </View>
    </Modal>
  );
}

const s = themedStyles(() => ({
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
  sectionTitle: { color: colors.muted, fontSize: 11, fontWeight: '800', letterSpacing: 1.5, marginTop: 14, marginBottom: 10, paddingLeft: 4 },
  presetsGrid: { gap: 10, marginBottom: 14 },
  presetCard: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  presetCardActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  presetIconRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  activeBadge: { fontSize: 9, fontWeight: '900', color: '#000', backgroundColor: '#fff', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 10 },
  presetName: { color: colors.text, fontSize: 15, fontWeight: '700' },
  presetNameActive: { color: '#000' },
  presetDesc: { color: colors.muted, fontSize: 12, marginTop: 3 },
  presetDescActive: { color: 'rgba(0,0,0,0.75)' },
  sliderLabel: { color: colors.text, fontSize: 14, fontWeight: '700' },
  sliderValue: { color: colors.accent, fontSize: 14, fontWeight: '800' },
  scaleRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  scaleMark: { color: colors.muted, fontSize: 10 },
  paramLabel: { color: colors.text, fontSize: 13 },
}));

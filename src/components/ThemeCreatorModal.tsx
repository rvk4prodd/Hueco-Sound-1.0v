import React, { useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  Share,
  Text,
  TextInput,
  View,
} from 'react-native';
import Slider from '@react-native-community/slider';
import { Ionicons } from '@expo/vector-icons';
import { colors, themedStyles, useHuecoTheme } from '../theme';
import { useExperienceStore } from '../preferences/experience';
import { useUIStore } from '../ui/useUIStore';
import { GlassCard } from './GlassCard';
import type { AccentTheme, WallpaperPreset } from '../preferences/experience';
import { importTheme } from '../preferences/themeImport';

interface Props {
  visible: boolean;
  onClose: () => void;
}

export function ThemeCreatorModal({ visible, onClose }: Props) {
 useHuecoTheme();
  const exp = useExperienceStore();
  const notify = useUIStore((s) => s.notify);
  const [importText, setImportText] = useState('');
  const [showImportBox, setShowImportBox] = useState(false);

  const accents: { id: AccentTheme; label: string; hex: string }[] = [
    { id: 'cyan', label: 'Cyan', hex: '#00e5ff' },
    { id: 'purple', label: 'Roxo Cyber', hex: '#a855f7' },
    { id: 'emerald', label: 'Esmeralda', hex: '#10b981' },
    { id: 'amber', label: 'Âmbar', hex: '#f59e0b' },
    { id: 'rose', label: 'Neon Rosa', hex: '#f43f5e' },
    { id: 'crimson', label: 'Rubi', hex: '#ef4444' },
    { id: 'gold', label: 'Dourado', hex: '#eab308' },
    { id: 'blue', label: 'Azul Elétrico', hex: '#3b82f6' },
    { id: 'white', label: 'Branco Puro', hex: '#f8fafc' },
  ];

  const wallpapers: { id: WallpaperPreset; label: string }[] = [
    { id: 'default', label: 'Hueco Dark' },
    { id: 'neon', label: 'Cyberpunk Neon' },
    { id: 'midnight', label: 'Midnight Violet' },
    { id: 'aurora', label: 'Aurora Glass' },
    { id: 'sunset', label: 'Tokyo Sunset' },
  ];

  const handleExportTheme = async () => {
    const payload = JSON.stringify({
      accentTheme: exp.accentTheme,
      wallpaperPreset: exp.wallpaperPreset,
      glassBlurIntensity: exp.glassBlurIntensity,
      glassOpacity: exp.glassOpacity,
      glassEnabled: exp.glassEnabled,
      visualizerMode: exp.visualizerMode,
      lyricsFXStyle: exp.lyricsFXStyle,
    }, null, 2);

    try {
      await Share.share({
        message: payload,
        title: 'Tema Personalizado Hueco Sound',
      });
    } catch {
      notify('Código do tema exportado.');
    }
  };

  const handleImportTheme = () => {
    try {
      const parsed = JSON.parse(importText.trim());
      exp.configure(importTheme(parsed, exp));
      notify('Tema importado com sucesso!');
      setShowImportBox(false);
      setImportText('');
    } catch {
      Alert.alert('Erro ao importar', 'O formato do tema JSON é inválido.');
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={s.container}>
        {/* Header */}
        <View style={s.header}>
          <View>
            <Text style={s.title}>Theme Creator</Text>
            <Text style={s.subtitle}>Personalize cores, vidro glass e compartilhe seu visual</Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Fechar" onPress={onClose} style={s.closeBtn}>
            <Ionicons name="close" size={24} color={colors.text} />
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
          {/* Live Preview Card */}
          <Text style={s.sectionTitle}>PRÉVIA EM TEMPO REAL</Text>
          <GlassCard style={s.previewCard}>
            <View style={s.rowBetween}>
              <View>
                <Text style={s.previewTitle}>Hueco Glass Theme</Text>
                <Text style={s.previewSubtitle}>Visual translúcido adaptável</Text>
              </View>
              <View style={[s.previewBadge, { backgroundColor: colors.accent }]}>
                <Text style={s.previewBadgeText}>ATIVO</Text>
              </View>
            </View>
          </GlassCard>

          {/* Accent Color Picker */}
          <Text style={s.sectionTitle}>COR DE DESTAQUE (ACCENT)</Text>
          <View style={s.swatchesGrid}>
            {accents.map((acc) => {
              const active = exp.accentTheme === acc.id;
              return (
                <Pressable
                  key={acc.id}
                  accessibilityRole="button"
                  onPress={() => exp.configure({ accentTheme: acc.id })}
                  style={[s.swatch, { borderColor: acc.hex }, active && s.swatchActive]}
                >
                  <View style={[s.swatchCircle, { backgroundColor: acc.hex }]} />
                  <Text style={[s.swatchText, active && { color: acc.hex, fontWeight: '800' }]}>
                    {acc.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* Wallpaper Preset */}
          <Text style={s.sectionTitle}>PLANO DE FUNDO</Text>
          <View style={s.wpRow}>
            {wallpapers.map((wp) => {
              const active = exp.wallpaperPreset === wp.id;
              return (
                <Pressable
                  key={wp.id}
                  accessibilityRole="button"
                  onPress={() => exp.configure({ wallpaperPreset: wp.id, customWallpaperUri: null })}
                  style={[s.wpChip, active && s.wpChipActive]}
                >
                  <Text style={[s.wpChipText, active && s.wpChipTextActive]}>{wp.label}</Text>
                </Pressable>
              );
            })}
          </View>

          {/* Glass Controls */}
          <Text style={s.sectionTitle}>AJUSTES DE VIDRO (GLASSMORPHISM)</Text>

          {/* Glass Blur Slider */}
          <GlassCard style={s.card}>
            <View style={s.rowBetween}>
              <Text style={s.cardTitle}>Intensidade do Desfoque</Text>
              <Text style={s.sliderValue}>{exp.glassBlurIntensity}%</Text>
            </View>
            <Slider
              minimumValue={0}
              maximumValue={100}
              step={5}
              value={exp.glassBlurIntensity}
              onValueChange={(val) => exp.configure({ glassBlurIntensity: val })}
              minimumTrackTintColor={colors.accent}
              maximumTrackTintColor="rgba(255,255,255,0.15)"
              thumbTintColor={colors.accent}
            />
          </GlassCard>

          {/* Card Opacity Slider */}
          <GlassCard style={s.card}>
            <View style={s.rowBetween}>
              <Text style={s.cardTitle}>Transparência dos Cartões</Text>
              <Text style={s.sliderValue}>{Math.round(exp.glassOpacity * 100)}%</Text>
            </View>
            <Slider
              minimumValue={0.3}
              maximumValue={0.95}
              step={0.05}
              value={exp.glassOpacity}
              onValueChange={(val) => exp.configure({ glassOpacity: val })}
              minimumTrackTintColor={colors.accent}
              maximumTrackTintColor="rgba(255,255,255,0.15)"
              thumbTintColor={colors.accent}
            />
          </GlassCard>

          {/* Export & Import Actions */}
          <Text style={s.sectionTitle}>COMPARTILHAMENTO DE TEMAS</Text>
          <View style={s.shareRow}>
            <Pressable accessibilityRole="button" onPress={handleExportTheme} style={s.actionBtn}>
              <Ionicons name="share-social-outline" size={18} color="#000" />
              <Text style={s.actionBtnText}>Exportar Tema</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => setShowImportBox(!showImportBox)}
              style={[s.actionBtn, { backgroundColor: 'rgba(255,255,255,0.1)' }]}
            >
              <Ionicons name="download-outline" size={18} color={colors.text} />
              <Text style={[s.actionBtnText, { color: colors.text }]}>Importar Tema</Text>
            </Pressable>
          </View>

          {showImportBox && (
            <GlassCard style={[s.card, { marginTop: 12 }]}>
              <Text style={s.cardTitle}>Cole o código JSON do tema:</Text>
              <TextInput
                value={importText}
                onChangeText={setImportText}
                placeholder='{"accentTheme": "purple", ...}'
                placeholderTextColor={colors.muted}
                style={s.input}
                multiline
              />
              <Pressable accessibilityRole="button" onPress={handleImportTheme} style={[s.actionBtn, { marginTop: 10 }]}>
                <Text style={s.actionBtnText}>Aplicar Tema Importado</Text>
              </Pressable>
            </GlassCard>
          )}
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
  sectionTitle: { color: colors.muted, fontSize: 11, fontWeight: '800', letterSpacing: 1.5, marginTop: 14, marginBottom: 10, paddingLeft: 4 },
  previewCard: { padding: 20, marginBottom: 14, borderRadius: 20 },
  previewTitle: { color: colors.text, fontSize: 18, fontWeight: '800' },
  previewSubtitle: { color: colors.muted, fontSize: 12, marginTop: 4 },
  previewBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  previewBadgeText: { color: '#000', fontSize: 10, fontWeight: '900' },
  swatchesGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  swatch: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  swatchActive: { backgroundColor: 'rgba(255,255,255,0.14)' },
  swatchCircle: { width: 14, height: 14, borderRadius: 7 },
  swatchText: { color: colors.muted, fontSize: 12, fontWeight: '600' },
  wpRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  wpChip: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  wpChipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  wpChipText: { color: colors.muted, fontSize: 12, fontWeight: '600' },
  wpChipTextActive: { color: '#000', fontWeight: '800' },
  card: { padding: 16, marginBottom: 14 },
  cardTitle: { color: colors.text, fontSize: 14, fontWeight: '700' },
  sliderValue: { color: colors.accent, fontSize: 14, fontWeight: '800' },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  shareRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 18,
    backgroundColor: colors.accent,
  },
  actionBtnText: { color: '#000', fontSize: 13, fontWeight: '800' },
  input: {
    backgroundColor: 'rgba(0,0,0,0.4)',
    color: colors.text,
    padding: 12,
    borderRadius: 12,
    marginTop: 8,
    minHeight: 70,
    fontSize: 12,
  },
}));

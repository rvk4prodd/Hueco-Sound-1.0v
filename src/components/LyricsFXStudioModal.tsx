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
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme';
import { useExperienceStore } from '../preferences/experience';
import { GlassCard } from './GlassCard';
import type { LyricsFXStyle } from '../types';

interface Props {
  visible: boolean;
  onClose: () => void;
}

export function LyricsFXStudioModal({ visible, onClose }: Props) {
  const lyricsFXStyle = useExperienceStore((s) => s.lyricsFXStyle);
  const lyricsFontSize = useExperienceStore((s) => s.lyricsFontSize);
  const lyricsGlow = useExperienceStore((s) => s.lyricsGlow);
  const configure = useExperienceStore((s) => s.configure);

  const stylesList: { id: LyricsFXStyle; title: string; desc: string; icon: keyof typeof Ionicons.glyphMap }[] = [
    { id: 'neon_amv', title: 'Neon AMV Glow', desc: 'Aura brilhante e sombras neon com estética de anime music video', icon: 'sparkles' },
    { id: 'kinetic_zoom', title: 'Kinetic Zoom', desc: 'Verso ativo ganha destaque dinâmico com escala e transição suave', icon: 'expand' },
    { id: 'subtle_shake', title: 'Bass Shake', desc: 'Vibração rítmica sutil no compasso dos versos principais', icon: 'pulse' },
    { id: 'karaoke_fill', title: 'Karaoke Fill', desc: 'Preenchimento gradativo e contraste marcado do verso atual', icon: 'mic' },
    { id: 'clean', title: 'Clean Clássico', desc: 'Tipografia minimalista com opacidade suave nos versos passados', icon: 'text' },
  ];

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={s.container}>
        {/* Header */}
        <View style={s.header}>
          <View>
            <Text style={s.title}>Lyrics FX Studio</Text>
            <Text style={s.subtitle}>Estilos visuais e animações para letras sincronizadas</Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Fechar" onPress={onClose} style={s.closeBtn}>
            <Ionicons name="close" size={24} color={colors.text} />
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
          {/* Style Selector Section */}
          <Text style={s.sectionTitle}>ESTILO DE ANIMAÇÃO DA LETRA</Text>
          <View style={s.list}>
            {stylesList.map((st) => {
              const active = lyricsFXStyle === st.id;
              return (
                <Pressable
                  key={st.id}
                  accessibilityRole="button"
                  onPress={() => configure({ lyricsFXStyle: st.id })}
                  style={({ pressed }) => [s.styleCard, active && s.styleCardActive, pressed && { opacity: 0.7 }]}
                >
                  <View style={s.iconRow}>
                    <Ionicons name={st.icon} size={22} color={active ? '#000' : colors.accent} />
                    {active && <Text style={s.activeBadge}>SELECIONADO</Text>}
                  </View>
                  <Text style={[s.styleName, active && s.styleNameActive]}>{st.title}</Text>
                  <Text style={[s.styleDesc, active && s.styleDescActive]}>{st.desc}</Text>
                </Pressable>
              );
            })}
          </View>

          {/* Typography Settings Section */}
          <Text style={s.sectionTitle}>TIPOGRAFIA & BRILHO</Text>

          {/* Font Size Selector */}
          <GlassCard style={s.card}>
            <Text style={s.cardTitle}>Tamanho da Fonte</Text>
            <Text style={s.cardDesc}>Ajuste a escala dos versos na tela cheia</Text>
            <View style={s.sizesRow}>
              {(['small', 'medium', 'large', 'xlarge'] as const).map((sz) => {
                const active = lyricsFontSize === sz;
                const labels = { small: 'Pequena', medium: 'Média', large: 'Grande', xlarge: 'Extra' };
                return (
                  <Pressable
                    key={sz}
                    accessibilityRole="button"
                    onPress={() => configure({ lyricsFontSize: sz })}
                    style={[s.sizeBtn, active && s.sizeBtnActive]}
                  >
                    <Text style={[s.sizeBtnText, active && s.sizeBtnTextActive]}>{labels[sz]}</Text>
                  </Pressable>
                );
              })}
            </View>
          </GlassCard>

          {/* Neon Glow Toggle */}
          <GlassCard style={s.card}>
            <View style={s.rowBetween}>
              <View>
                <Text style={s.cardTitle}>Brilho Neon (Glow Aura)</Text>
                <Text style={s.cardDesc}>Adiciona difusão luminosa colorida ao verso ativo</Text>
              </View>
              <Switch
                value={lyricsGlow}
                onValueChange={(val) => configure({ lyricsGlow: val })}
                trackColor={{ false: colors.elevated, true: '#237b69' }}
                thumbColor={lyricsGlow ? colors.accent : colors.muted}
              />
            </View>
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
  sectionTitle: { color: colors.muted, fontSize: 11, fontWeight: '800', letterSpacing: 1.5, marginTop: 14, marginBottom: 10, paddingLeft: 4 },
  list: { gap: 10, marginBottom: 14 },
  styleCard: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  styleCardActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  iconRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  activeBadge: { fontSize: 9, fontWeight: '900', color: '#000', backgroundColor: '#fff', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 10 },
  styleName: { color: colors.text, fontSize: 15, fontWeight: '700' },
  styleNameActive: { color: '#000' },
  styleDesc: { color: colors.muted, fontSize: 12, marginTop: 3 },
  styleDescActive: { color: 'rgba(0,0,0,0.75)' },
  card: { padding: 16, marginBottom: 14 },
  cardTitle: { color: colors.text, fontSize: 15, fontWeight: '700' },
  cardDesc: { color: colors.muted, fontSize: 12, marginTop: 3 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sizesRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  sizeBtn: {
    flex: 1,
    paddingVertical: 10,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  sizeBtnActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  sizeBtnText: { color: colors.muted, fontSize: 12, fontWeight: '700' },
  sizeBtnTextActive: { color: '#000' },
});

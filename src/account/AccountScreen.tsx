import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { usePlayerStore } from '../player/usePlayerStore';
import { useDeviceLibraryStore } from '../library/useDeviceLibraryStore';
import { exportLibrary, importLibrary } from '../library/transfers';
import { useUIStore } from '../ui/useUIStore';
import { colors } from '../theme';
import { GlassCard } from '../components/GlassCard';
import { ActionButton, IconButton, screenStyles as base } from '../screens/ScreenParts';
import { CharacterSprite } from '../components/HuecoBrand';

export function AccountScreen() {
  const likedTracks = usePlayerStore(s => s.likedTracks);
  const playlists = usePlayerStore(s => s.playlists);
  const recentTracks = usePlayerStore(s => s.recentTracks);
  const localTracks = useDeviceLibraryStore(s => s.localTracks);
  const notify = useUIStore(s => s.notify);
  const [busy, setBusy] = useState<'export' | 'import' | null>(null);

  const handleExport = async () => {
    if (busy) return;
    setBusy('export');
    try {
      await exportLibrary();
      notify('Backup da biblioteca salvo com sucesso!');
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Não foi possível exportar.');
    } finally {
      setBusy(null);
    }
  };

  const handleImport = async () => {
    if (busy) return;
    setBusy('import');
    try {
      const count = await importLibrary();
      if (count > 0) notify(`${count} itens restaurados do backup!`);
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Não foi possível importar.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={base.screen}>
      <View style={s.header}>
        <IconButton name="arrow-back" label="Voltar" onPress={() => router.canGoBack() ? router.back() : router.replace('/settings')} />
        <Text style={s.title}>Sua Coleção & Dados</Text>
      </View>

      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        <View style={s.hero}>
          <CharacterSprite size={80} variant={1} />
          <Text style={s.name}>Hueco Sound no seu Dispositivo</Text>
          <Text style={s.body}>
            Seus dados são 100% locais e privados. Todas as suas playlists, curtidas e preferências estão salvas com segurança no seu aparelho.
          </Text>
        </View>

        {/* Stats Grid */}
        <View style={s.statsGrid}>
          <GlassCard style={s.statCard}>
            <Ionicons name="heart" size={24} color={colors.accent} />
            <Text style={s.statValue}>{likedTracks.length}</Text>
            <Text style={s.statLabel}>Curtidas</Text>
          </GlassCard>

          <GlassCard style={s.statCard}>
            <Ionicons name="albums" size={24} color="#60a5fa" />
            <Text style={s.statValue}>{playlists.length}</Text>
            <Text style={s.statLabel}>Playlists</Text>
          </GlassCard>

          <GlassCard style={s.statCard}>
            <Ionicons name="phone-portrait" size={24} color="#34d399" />
            <Text style={s.statValue}>{localTracks.length}</Text>
            <Text style={s.statLabel}>Arquivos Locais</Text>
          </GlassCard>

          <GlassCard style={s.statCard}>
            <Ionicons name="time" size={24} color="#fbbf24" />
            <Text style={s.statValue}>{recentTracks.length}</Text>
            <Text style={s.statLabel}>Histórico</Text>
          </GlassCard>
        </View>

        {/* Backup Management Cards */}
        <GlassCard style={s.card}>
          <View style={s.cardHeader}>
            <Ionicons name="share-outline" size={24} color={colors.accent} />
            <View style={{ flex: 1 }}>
              <Text style={s.cardTitle}>Fazer Backup da Biblioteca</Text>
              <Text style={s.cardDesc}>Exporte suas playlists e curtidas para um arquivo JSON compatível.</Text>
            </View>
          </View>
          <ActionButton
            icon="share-outline"
            label={busy === 'export' ? 'Exportando...' : 'Exportar Backup'}
            disabled={!!busy}
            onPress={handleExport}
          />
        </GlassCard>

        <GlassCard style={s.card}>
          <View style={s.cardHeader}>
            <Ionicons name="download-outline" size={24} color="#60a5fa" />
            <View style={{ flex: 1 }}>
              <Text style={s.cardTitle}>Restaurar Backup</Text>
              <Text style={s.cardDesc}>Restaure playlists e músicas curtidas a partir de um arquivo de backup.</Text>
            </View>
          </View>
          <ActionButton
            secondary
            icon="download-outline"
            label={busy === 'import' ? 'Importando...' : 'Importar Backup'}
            disabled={!!busy}
            onPress={handleImport}
          />
        </GlassCard>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingTop: 50, paddingBottom: 15 },
  title: { color: colors.text, fontSize: 22, fontWeight: '800' },
  content: { padding: 20, gap: 16, paddingBottom: 50 },
  hero: { alignItems: 'center', gap: 8, paddingVertical: 12 },
  name: { color: colors.text, fontSize: 18, fontWeight: '700', textAlign: 'center' },
  body: { color: colors.muted, fontSize: 13, textAlign: 'center', lineHeight: 19, paddingHorizontal: 10 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  statCard: { flex: 1, minWidth: '45%', padding: 16, alignItems: 'center', gap: 6, borderRadius: 16 },
  statValue: { color: colors.text, fontSize: 22, fontWeight: '900' },
  statLabel: { color: colors.muted, fontSize: 12, fontWeight: '600' },
  card: { padding: 20, gap: 14, borderRadius: 20 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  cardTitle: { color: colors.text, fontSize: 16, fontWeight: '700' },
  cardDesc: { color: colors.muted, fontSize: 12, lineHeight: 17, marginTop: 2 },
});

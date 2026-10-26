import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { usePlayerStore } from '../player/usePlayerStore';
import { searchTracks } from '../api/innertube';
import { Track } from '../types';
import { SongRow } from '../components/SongRow';
import { colors } from '../theme';
import { ActionButton, Chip, Cover, EmptyState, IconButton, screenStyles as base } from './ScreenParts';
import { CharacterSprite, HuecoLogo } from '../components/HuecoBrand';
import { GlassCard } from '../components/GlassCard';

const cacheByVibe = new Map<string, { hits: Track[]; discoveries: Track[]; at: number }>();
const greeting = () => { const hour = new Date().getHours(); return hour < 5 || hour >= 18 ? 'Boa noite' : hour < 12 ? 'Bom dia' : 'Boa tarde'; };

async function discover(vibe: string, seedTrack: Track | undefined, signal: AbortSignal) {
  let hitsQuery = 'Top Brasil mais tocadas';
  let discQuery = 'Trap Brasil sucessos';

  if (vibe === 'trap') {
    hitsQuery = 'Trap Brasil mais tocadas';
    discQuery = 'Trap Nacional lançamentos';
  } else if (vibe === 'funk') {
    hitsQuery = 'Funk Brasil mais tocadas';
    discQuery = 'Funk Paulista e BH';
  } else if (vibe === 'pop') {
    hitsQuery = 'Pop internacional Brasil';
    discQuery = 'Pop hits 2026';
  } else if (vibe === 'electronic') {
    hitsQuery = 'Eletrônica Brazilian Bass';
    discQuery = 'Phonk & EDM remix';
  } else if (seedTrack) {
    const artist = seedTrack.artists.split(',')[0].trim();
    hitsQuery = `${artist} mais tocadas`;
    discQuery = `músicas parecidas com ${seedTrack.title}`;
  }

  const [hits, discoveries] = await Promise.all([
    searchTracks(hitsQuery, signal).catch(() => []),
    searchTracks(discQuery, signal).catch(() => []),
  ]);

  return {
    hits: hits.slice(0, 15),
    discoveries: discoveries.slice(0, 12),
    at: Date.now(),
  };
}

export function HomeScreen() {
  const recentTracks = usePlayerStore(s => s.recentTracks);
  const likedTracks = usePlayerStore(s => s.likedTracks);
  const playlists = usePlayerStore(s => s.playlists);
  const playTrack = usePlayerStore(s => s.playTrack);
  const [vibe, setVibe] = useState<'for_you' | 'trap' | 'funk' | 'pop' | 'electronic'>('for_you');
  const [hits, setHits] = useState<Track[]>(() => cacheByVibe.get('for_you')?.hits ?? []);
  const [discoveries, setDiscoveries] = useState<Track[]>(() => cacheByVibe.get('for_you')?.discoveries ?? []);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);
  const request = useRef<AbortController | null>(null);

  const seed = recentTracks[0] || likedTracks[0];

  const load = useCallback(async (refresh = false, targetVibe = vibe) => {
    const cached = cacheByVibe.get(targetVibe);
    if (!refresh && cached && Date.now() - cached.at <= 15 * 60_000) {
      setHits(cached.hits);
      setDiscoveries(cached.discoveries);
      setError(false);
      return;
    }
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError(false);
    try {
      const data = await discover(targetVibe, seed, controller.signal);
      if (controller.signal.aborted) return;
      cacheByVibe.set(targetVibe, data);
      setHits(data.hits);
      setDiscoveries(data.discoveries);
    } catch {
      if (!controller.signal.aborted) setError(true);
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [vibe, seed]);

  useEffect(() => {
    let active = true;
    const run = async () => {
      await Promise.resolve();
      if (active) {
        void load(false, vibe);
      }
    };
    void run();
    return () => {
      active = false;
      request.current?.abort();
    };
  }, [vibe, load]);
  const quickTracks = recentTracks.slice(0, 6);
  const hero = recentTracks[0] || hits[0];
  return <FlatList style={base.screen} data={hits} keyExtractor={t => t.id} showsVerticalScrollIndicator={false} contentContainerStyle={base.content} initialNumToRender={8} windowSize={5} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={colors.accent} colors={[colors.accent]} />} renderItem={({ item }) => <SongRow track={item} onPress={() => void playTrack(item, hits)} />}
    ListHeaderComponent={<>
      <View style={base.header}><View style={{ flex: 1 }}><HuecoLogo width={166} /><Text style={[base.subtitle, { marginTop: 8 }]}>{greeting()}. Seu som, seu mundo.</Text></View><IconButton name="time-outline" label="Histórico de reprodução" onPress={() => router.push({ pathname: '/playlist/[id]', params: { id: 'recent' } })} /><IconButton name="color-palette-outline" label="Personalizar plano de fundo e visual" onPress={() => router.push('/settings')} /><IconButton name="settings-outline" label="Abrir configurações" onPress={() => router.push('/settings')} /></View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={base.chips}>
        <Chip label="Para você" active={vibe === 'for_you'} onPress={() => setVibe('for_you')} />
        <Chip label="Trap & Rap" active={vibe === 'trap'} onPress={() => setVibe('trap')} />
        <Chip label="Funk & Urban" active={vibe === 'funk'} onPress={() => setVibe('funk')} />
        <Chip label="Pop Hits" active={vibe === 'pop'} onPress={() => setVibe('pop')} />
        <Chip label="Eletrônica" active={vibe === 'electronic'} onPress={() => setVibe('electronic')} />
      </ScrollView>
      <GlassCard style={s.hero}><View style={s.heroTop}><Text style={s.heroLabel}>{recentTracks.length ? 'CONTINUE DE ONDE PAROU' : 'ENTRE NO SEU MUNDO'}</Text><Ionicons name="sparkles" size={19} color={colors.accent} /></View><View style={s.heroBody}><View style={{ flex: 1, gap: 10 }}><Text style={s.heroTitle} numberOfLines={2}>{hero?.title || 'O silêncio termina aqui.'}</Text><Text style={s.heroDescription} numberOfLines={2}>{hero?.artists || 'Um novo universo para as suas músicas.'}</Text></View><CharacterSprite size={100} variant={0} /></View><View style={s.heroFooter}><ActionButton label={hero ? 'Ouvir agora' : 'Explorar músicas'} icon={hero ? 'play' : 'search'} onPress={() => hero ? void playTrack(hero, recentTracks.length ? recentTracks : hits) : router.push('/search')} /><Text style={s.heroNote}>HUECO SOUND / ZHYRSNOW</Text></View></GlassCard>
      {quickTracks.length > 0 && <View style={s.quickGrid}>{quickTracks.map(t => <Pressable key={t.id} accessibilityRole="button" accessibilityLabel={`Reproduzir ${t.title}`} onPress={() => void playTrack(t, recentTracks)} style={({ pressed }) => [s.quickCard, pressed && { opacity: .6 }]}><Cover uri={t.coverUrl} size={52} /><Text style={s.quickTitle} numberOfLines={2}>{t.title}</Text></Pressable>)}</View>}
      <View style={base.sectionRow}><Text style={base.section}>Feito por você</Text><Pressable accessibilityRole="button" onPress={() => router.push('/library')} style={s.textLink}><Text style={base.link}>VER TUDO</Text></Pressable></View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.horizontal}>
        <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/playlist/[id]', params: { id: 'liked' } })} style={s.collectionCard}><Cover size={142} icon="heart" color="#5750aa" /><Text style={s.cardTitle}>Suas curtidas</Text><Text style={s.cardSubtitle}>{likedTracks.length} músicas salvas</Text></Pressable>
        {playlists.slice(0, 7).map(p => <Pressable accessibilityRole="button" key={p.id} onPress={() => router.push({ pathname: '/playlist/[id]', params: { id: p.id } })} style={s.collectionCard}><Cover size={142} uri={p.tracks[0]?.coverUrl} color="#354f40" icon="albums" /><Text numberOfLines={1} style={s.cardTitle}>{p.name}</Text><Text style={s.cardSubtitle}>{p.tracks.length} músicas</Text></Pressable>)}
        {!playlists.length && <Pressable accessibilityRole="button" onPress={() => router.push('/library')} style={s.collectionCard}><View style={s.createCover}><Ionicons name="add" size={38} color={colors.accent} /></View><Text style={s.cardTitle}>Seu novo mix</Text><Text style={s.cardSubtitle}>Crie uma playlist</Text></Pressable>}
      </ScrollView>
      {discoveries.length > 0 && <><View style={base.sectionRow}><Text style={base.section}>Fora do óbvio</Text><Text style={base.link}>DESCUBRA</Text></View><FlatList horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.horizontal} data={discoveries} keyExtractor={t => t.id} initialNumToRender={4} renderItem={({ item }) => <Pressable accessibilityRole="button" accessibilityLabel={`Reproduzir ${item.title}`} style={s.collectionCard} onPress={() => void playTrack(item, discoveries)}><Cover uri={item.coverUrl} size={142} /><Text numberOfLines={1} style={s.cardTitle}>{item.title}</Text><Text numberOfLines={1} style={s.cardSubtitle}>{item.artists}</Text></Pressable>} /></>}
      <View style={base.sectionRow}><Text style={base.section}>No radar</Text>{loading && <ActivityIndicator color={colors.accent} />}</View>
      {error && <EmptyState title="Não deu para atualizar" description="Confira sua conexão e tente carregar as descobertas novamente." icon="cloud-offline-outline" action="Tentar novamente" onAction={() => void load()} />}
    </>}
    ListEmptyComponent={!loading && !error ? <EmptyState title="Descubra um som novo" description="Busque uma música ou artista para começar sua coleção." action="Buscar músicas" onAction={() => router.push('/search')} /> : undefined}
  />;
}

const s = StyleSheet.create({
  hero: { marginHorizontal: 20, marginTop: 8, marginBottom: 22, borderRadius: 24, padding: 20 },
  heroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  heroLabel: { color: colors.accent, fontSize: 10, fontWeight: '800', letterSpacing: 1.6 },
  heroBody: { flexDirection: 'row', gap: 14, alignItems: 'center' },
  heroTitle: { color: colors.text, fontSize: 27, lineHeight: 32, fontWeight: '800', letterSpacing: -.7 },
  heroDescription: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  heroFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 22, gap: 10, flexWrap: 'wrap' },
  heroNote: { color: colors.accent, fontSize: 8, letterSpacing: 1.5, fontWeight: '700' },
  quickGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 20, gap: 8 },
  quickCard: { width: '48.5%', flexGrow: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(21, 27, 35, 0.68)', borderRadius: 10, gap: 9, overflow: 'hidden', paddingRight: 8, borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.08)' },
  quickTitle: { flex: 1, color: colors.text, fontSize: 11, lineHeight: 15, fontWeight: '700' },
  horizontal: { paddingHorizontal: 20, gap: 16 },
  collectionCard: { width: 142, gap: 4 },
  cardTitle: { color: colors.text, fontSize: 14, fontWeight: '700', marginTop: 7 },
  cardSubtitle: { color: colors.muted, fontSize: 12, lineHeight: 17 },
  createCover: { width: 142, height: 142, borderRadius: 10, backgroundColor: 'rgba(21, 27, 35, 0.65)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.12)' },
  textLink: { minHeight: 44, justifyContent: 'center', paddingLeft: 15 },
});

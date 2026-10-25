import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Keyboard, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { searchSoundCloudTracks, searchTracks } from '../api/innertube';
import { usePlayerStore } from '../player/usePlayerStore';
import { useUIStore } from '../ui/useUIStore';
import { SongRow } from '../components/SongRow';
import { Track } from '../types';
import { colors } from '../theme';
import { Chip, Cover, EmptyState, IconButton, screenStyles as base } from './ScreenParts';

const HISTORY_KEY = '@hueco_search_history_v1';
const LEGACY_HISTORY_KEY = '@liner_search_history_v1';
const EMPTY_TRACKS: Track[] = [];
const GENRES = [
  { name: 'Trap Brasil', caption: 'Novos sons, novas ondas', color: '#554481', icon: 'planet' },
  { name: 'Funk', caption: 'Aumenta o volume', color: '#824234', icon: 'flame' },
  { name: 'Pop', caption: 'Só as favoritas', color: '#426552', icon: 'sparkles' },
  { name: 'Sertanejo', caption: 'Pra cantar junto', color: '#7a6033', icon: 'musical-notes' },
  { name: 'Hip-Hop', caption: 'Barras e batidas', color: '#34546e', icon: 'mic' },
  { name: 'Eletrônica', caption: 'Entre na frequência', color: '#4f417c', icon: 'pulse' },
  { name: 'Rock', caption: 'Guitarras no máximo', color: '#713e4c', icon: 'flash' },
  { name: 'MPB', caption: 'A nossa música', color: '#42665e', icon: 'leaf' },
  { name: 'Lo-fi', caption: 'Foco no seu tempo', color: '#66517a', icon: 'moon' },
  { name: 'Acústico', caption: 'Perto de você', color: '#796349', icon: 'headset' },
] as const;
type Entity = { kind: 'artist' | 'album'; name: string; coverUrl: string; count: number };
type ResultItem = { kind: 'track'; track: Track } | Entity;

export function SearchScreen() {
  const params = useLocalSearchParams<{ q?: string; playlistId?: string }>();
  const initialQuery = typeof params.q === 'string' ? params.q : '';
  return <SearchContent key={initialQuery} initialQuery={initialQuery} playlistId={typeof params.playlistId === 'string' ? params.playlistId : undefined} />;
}

function SearchContent({ initialQuery, playlistId }: { initialQuery: string; playlistId?: string }) {
  const [query, setQuery] = useState(initialQuery);
  const [response, setResponse] = useState<{ term: string; attempt: number; tracks: Track[]; error: string | null }>({ term: '', attempt: -1, tracks: [], error: null });
  const [history, setHistory] = useState<string[]>([]);
  const [filter, setFilter] = useState('all');
  const [retry, setRetry] = useState(0);
  const term = query.trim();
  const isCurrentResponse = response.term === term && response.attempt === retry;
  const results = isCurrentResponse ? response.tracks : EMPTY_TRACKS;
  const loading = !!term && !isCurrentResponse;
  const error = isCurrentResponse ? response.error : null;
  const historyRef = useRef<string[]>([]);
  const input = useRef<React.ComponentRef<typeof TextInput>>(null);
  const sequence = useRef(0);
  const playTrack = usePlayerStore(s => s.playTrack);
  const playlists = usePlayerStore(s => s.playlists);
  const addTrackToPlaylist = usePlayerStore(s => s.addTrackToPlaylist);
  const notify = useUIStore(s => s.notify);
  const targetPlaylist = playlists.find(p => p.id === playlistId);

  useFocusEffect(useCallback(() => {
    let active = true;
    void AsyncStorage.getItem(HISTORY_KEY).then(async value => {
      if (!active) return;
      const effective = value || await AsyncStorage.getItem(LEGACY_HISTORY_KEY);
      if (!effective) { historyRef.current = []; setHistory([]); return; }
      const parsed: unknown = JSON.parse(effective);
      if (Array.isArray(parsed)) { const next = parsed.filter((v): v is string => typeof v === 'string').slice(0, 8); historyRef.current = next; setHistory(next); }
    }).catch(() => undefined);
    return () => { active = false; };
  }, []));

  useEffect(() => {
    const id = ++sequence.current;
    const controller = new AbortController();
    if (!term) return () => controller.abort();
    const timer = setTimeout(() => {
      const searchAction = async () => {
        if (filter === 'soundcloud') {
          return searchSoundCloudTracks(term, controller.signal);
        }
        if (filter === 'videos' || filter === 'songs') {
          return searchTracks(term, { signal: controller.signal, mode: filter });
        }
        // 'all', 'artists', 'albums': search broad YouTube + SoundCloud in parallel
        const [ytRes, scRes] = await Promise.allSettled([
          searchTracks(term, { signal: controller.signal, mode: 'all' }),
          searchSoundCloudTracks(term, controller.signal),
        ]);
        const yt = ytRes.status === 'fulfilled' ? ytRes.value : [];
        const sc = scRes.status === 'fulfilled' ? scRes.value : [];
        const seen = new Set(yt.map(t => t.id));
        const merged = [...yt];
        for (const t of sc) {
          if (!seen.has(t.id)) {
            merged.push(t);
            seen.add(t.id);
          }
        }
        return merged;
      };

      void searchAction().then(tracks => {
        if (id !== sequence.current || controller.signal.aborted) return;
        setResponse({ term, attempt: retry, tracks, error: null });
        const next = [term, ...historyRef.current.filter(v => v.toLocaleLowerCase() !== term.toLocaleLowerCase())].slice(0, 8);
        historyRef.current = next; setHistory(next);
        void AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(next)).catch(() => undefined);
      }).catch(() => {
        if (id === sequence.current && !controller.signal.aborted) setResponse({ term, attempt: retry, tracks: [], error: 'Não foi possível buscar agora. Verifique sua conexão.' });
      });
    }, 350);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [term, filter, retry]);

  const entities = useMemo(() => {
    const artists = new Map<string, Entity>(); const albums = new Map<string, Entity>();
    for (const t of results) {
      const artist = t.artists.split(/[•,&]/)[0].trim();
      if (artist) { const current = artists.get(artist); artists.set(artist, { kind: 'artist', name: artist, coverUrl: t.coverUrl, count: (current?.count ?? 0) + 1 }); }
      if (t.albumTitle) { const current = albums.get(t.albumTitle); albums.set(t.albumTitle, { kind: 'album', name: t.albumTitle, coverUrl: t.coverUrl, count: (current?.count ?? 0) + 1 }); }
    }
    return { artists: [...artists.values()], albums: [...albums.values()] };
  }, [results]);
  const data: ResultItem[] = filter === 'artists' ? entities.artists : filter === 'albums' ? entities.albums : results.map(track => ({ kind: 'track' as const, track }));
  const openEntity = (entity: Entity) => { Keyboard.dismiss(); router.push({ pathname: '/collection', params: { kind: entity.kind, name: entity.name } }); };
  const removeHistory = (term?: string) => {
    const next = term ? historyRef.current.filter(v => v !== term) : [];
    historyRef.current = next; setHistory(next); void AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(next)).catch(() => undefined);
  };

  return <View style={base.screen}>
    <View style={base.header}><View style={{ flex: 1 }}><Text style={base.eyebrow}>ENCONTRE SUA FREQUÊNCIA</Text><Text style={base.title}>Buscar</Text></View><Ionicons name="search-outline" color={colors.accent} size={28} /></View>
    <View style={base.inputWrap}><Ionicons name="search" size={21} color={colors.muted} /><TextInput ref={input} value={query} onChangeText={setQuery} accessibilityLabel="Buscar músicas, artistas ou álbuns" placeholder="Músicas, artistas ou álbuns" placeholderTextColor={colors.muted} style={base.input} autoCorrect={false} autoCapitalize="none" returnKeyType="search" onSubmitEditing={Keyboard.dismiss} />{query.length > 0 && <IconButton name="close-circle" label="Limpar busca" onPress={() => { setQuery(''); input.current?.focus(); }} />}</View>
    {targetPlaylist && <View style={s.targetBanner}><Ionicons name="add-circle" color={colors.accent} size={20} /><Text style={s.targetText} numberOfLines={2}>Adicionar em <Text style={{ fontWeight: '800', color: colors.text }}>{targetPlaylist.name}</Text></Text><IconButton name="close" label="Encerrar adição à playlist" onPress={() => router.setParams({ playlistId: '' })} /></View>}
    {query.trim() ? <>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={base.chips}>{[{ key: 'all', name: 'Tudo' }, { key: 'videos', name: 'Prévias & Vídeos' }, { key: 'soundcloud', name: 'SoundCloud' }, { key: 'songs', name: 'Músicas' }, { key: 'artists', name: 'Artistas' }, { key: 'albums', name: 'Álbuns' }].map(item => <Chip key={item.key} label={item.name} active={filter === item.key} onPress={() => setFilter(item.key)} />)}</ScrollView>
      <FlatList data={loading || error ? [] : data} keyExtractor={item => item.kind === 'track' ? item.track.id : `${item.kind}:${item.name}`} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" showsVerticalScrollIndicator={false} contentContainerStyle={base.content} initialNumToRender={12} windowSize={7} renderItem={({ item }) => item.kind === 'track' ? <SongRow track={item.track} onPress={() => { Keyboard.dismiss(); void playTrack(item.track, results); }} rightAccessory={targetPlaylist ? <IconButton name={targetPlaylist.tracks.some(t => t.id === item.track.id) ? 'checkmark-circle' : 'add-circle-outline'} label={`Adicionar ${item.track.title} à playlist ${targetPlaylist.name}`} color={colors.accent} disabled={targetPlaylist.tracks.some(t => t.id === item.track.id)} onPress={() => { if (addTrackToPlaylist(targetPlaylist.id, item.track)) notify(`Adicionada a ${targetPlaylist.name}.`); }} /> : undefined} /> : <Pressable accessibilityRole="button" onPress={() => openEntity(item)} style={s.entityRow}><Cover size={58} uri={item.coverUrl} round={item.kind === 'artist'} /><View style={{ flex: 1, gap: 5 }}><Text style={s.entityName}>{item.name}</Text><Text style={base.subtitle}>{item.kind === 'artist' ? 'Artista' : 'Álbum'} · explorar músicas</Text></View><Ionicons name="chevron-forward" color={colors.muted} size={18} /></Pressable>}
        ListHeaderComponent={!loading && !error && filter === 'all' && entities.artists.length > 0 ? <><Text style={s.section}>Artistas encontrados</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={s.artistList}>{entities.artists.slice(0, 6).map(entity => <Pressable key={entity.name} accessibilityRole="button" onPress={() => openEntity(entity)} style={s.artistCard}><Cover size={80} uri={entity.coverUrl} round /><Text numberOfLines={1} style={s.artistName}>{entity.name}</Text></Pressable>)}</ScrollView><Text style={s.section}>Músicas</Text></> : undefined}
        ListEmptyComponent={loading ? <View style={s.loading}><ActivityIndicator size="large" color={colors.accent} /><Text style={base.subtitle}>Procurando seu próximo som…</Text></View> : error ? <EmptyState title="A busca não carregou" description={error} icon="cloud-offline-outline" action="Tentar novamente" onAction={() => setRetry(v => v + 1)} /> : <EmptyState title={filter === 'albums' ? 'Nenhum álbum identificado' : 'Nenhum resultado'} description={filter === 'albums' ? 'Alguns resultados não informam o álbum. Experimente buscar pelo título completo ou explorar as músicas.' : `Tente outro nome, artista ou uma parte do título de “${query.trim()}”.`} icon="search-outline" />}
      />
    </> : <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={base.content}>
      {history.length > 0 && <><View style={[base.sectionRow, { marginTop: 0 }]}><Text style={base.section}>Suas buscas</Text><Pressable accessibilityRole="button" onPress={() => removeHistory()} style={s.clearHistory}><Text style={base.link}>LIMPAR</Text></Pressable></View>{history.map(term => <View key={term} style={s.historyRow}><Pressable accessibilityRole="button" style={s.historyTerm} onPress={() => setQuery(term)}><Ionicons name="time-outline" size={21} color={colors.muted} /><Text style={s.historyText} numberOfLines={1}>{term}</Text></Pressable><IconButton name="close" label={`Remover busca ${term}`} onPress={() => removeHistory(term)} /></View>)}</>}
      <View style={base.sectionRow}><Text style={base.section}>Explore seu mundo</Text></View><View style={s.genres}>{GENRES.map(genre => <Pressable key={genre.name} accessibilityRole="button" accessibilityLabel={`Buscar ${genre.name}`} onPress={() => setQuery(genre.name)} style={({ pressed }) => [s.genre, { backgroundColor: genre.color, opacity: pressed ? .7 : 1 }]}><Text style={s.genreName}>{genre.name}</Text><Text style={s.genreCaption}>{genre.caption}</Text><Ionicons name={genre.icon} size={46} color="#ffffff30" style={s.genreIcon} /></Pressable>)}</View>
    </ScrollView>}
  </View>;
}

const s = StyleSheet.create({
  targetBanner: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 20, marginBottom: 14, paddingLeft: 14, borderRadius: 14, backgroundColor: '#253625' },
  targetText: { color: colors.muted, fontSize: 12, flex: 1, lineHeight: 18 },
  section: { color: colors.text, fontSize: 19, fontWeight: '800', marginHorizontal: 20, marginVertical: 15 },
  artistList: { paddingHorizontal: 20, gap: 18, marginBottom: 8 },
  artistCard: { width: 84, alignItems: 'center', gap: 9 },
  artistName: { color: colors.text, fontSize: 12, fontWeight: '600', textAlign: 'center' },
  entityRow: { paddingHorizontal: 20, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 14 },
  entityName: { color: colors.text, fontSize: 16, fontWeight: '700' },
  loading: { paddingTop: 65, alignItems: 'center', gap: 18 },
  clearHistory: { minHeight: 44, paddingHorizontal: 8, justifyContent: 'center' },
  historyRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 15 },
  historyTerm: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 12, paddingLeft: 5 },
  historyText: { flex: 1, color: colors.text, fontSize: 14 },
  genres: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 20, gap: 12 },
  genre: { width: '48%', flexGrow: 1, minHeight: 130, borderRadius: 17, padding: 16, overflow: 'hidden', gap: 9 },
  genreName: { color: '#fff', fontSize: 21, fontWeight: '800', letterSpacing: -.5 },
  genreCaption: { color: '#ffffffbd', fontSize: 11, fontWeight: '600', maxWidth: 110 },
  genreIcon: { position: 'absolute', bottom: -6, right: 4, transform: [{ rotate: '-16deg' }] },
});

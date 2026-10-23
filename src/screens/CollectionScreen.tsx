import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { searchTracks } from '../api/innertube';
import { usePlayerStore } from '../player/usePlayerStore';
import { useUIStore } from '../ui/useUIStore';
import { useDeviceLibraryStore } from '../library/useDeviceLibraryStore';
import { Track } from '../types';
import { SongRow } from '../components/SongRow';
import { colors } from '../theme';
import { ActionButton, Cover, EmptyState, IconButton, screenStyles as base } from './ScreenParts';

export function CollectionScreen() {
  const params = useLocalSearchParams<{ kind?: string; name?: string }>();
  const kind = params.kind === 'album' ? 'album' : 'artist';
  const name = typeof params.name === 'string' ? params.name : '';
  return <CollectionContent key={`${kind}:${name}`} kind={kind} name={name} />;
}

function CollectionContent({ kind, name }: { kind: 'album' | 'artist'; name: string }) {
  const likedTracks = usePlayerStore(s => s.likedTracks);
  const recentTracks = usePlayerStore(s => s.recentTracks);
  const playlists = usePlayerStore(s => s.playlists);
  const localTracks = useDeviceLibraryStore(s => s.localTracks);
  const createPlaylist = usePlayerStore(s => s.createPlaylist);
  const playTrack = usePlayerStore(s => s.playTrack);
  const notify = useUIStore(s => s.notify);
  const [remote, setRemote] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const saved = useMemo(() => {
    const term = name.toLocaleLowerCase();
    return [...likedTracks, ...recentTracks, ...localTracks, ...playlists.flatMap(p => p.tracks)].filter(t => kind === 'album' ? t.albumTitle?.toLocaleLowerCase() === term : t.artists.toLocaleLowerCase().includes(term));
  }, [kind, name, likedTracks, recentTracks, playlists, localTracks]);
  const tracks = useMemo(() => [...new Map([...saved, ...remote].map(t => [t.id, t])).values()], [saved, remote]);
  const retrieve = useCallback((request: AbortController) => {
    const response = name ? searchTracks(`${name} ${kind === 'album' ? 'álbum' : 'músicas'}`, request.signal) : Promise.resolve([]);
    return response.then(next => { if (!request.signal.aborted) setRemote(next); })
      .catch(() => { if (!request.signal.aborted) setError(true); })
      .finally(() => { if (!request.signal.aborted) { setLoading(false); setRefreshing(false); } });
  }, [name, kind]);
  const load = (refresh = false) => {
    controller.current?.abort(); const request = new AbortController(); controller.current = request;
    setError(false); if (refresh) setRefreshing(true); else setLoading(true);
    void retrieve(request);
  };
  useEffect(() => { const request = new AbortController(); controller.current = request; void retrieve(request); return () => controller.current?.abort(); }, [retrieve]);

  return <View style={base.screen}><FlatList data={tracks} keyExtractor={t => t.id} style={{ flex: 1 }} contentContainerStyle={base.content} initialNumToRender={12} windowSize={7} showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} colors={[colors.accent]} tintColor={colors.accent} />} renderItem={({ item, index }) => <SongRow track={item} index={index + 1} onPress={() => void playTrack(item, tracks)} />}
    ListHeaderComponent={<>
      <View style={s.top}><IconButton name="arrow-back" label="Voltar" onPress={() => router.canGoBack() ? router.back() : router.replace('/search')} /><Text style={s.topLabel}>{kind === 'artist' ? 'EXPLORAR ARTISTA' : 'EXPLORAR ÁLBUM'}</Text><View style={{ width: 44 }} /></View>
      <View style={s.hero}><Cover uri={tracks[0]?.coverUrl} size={168} round={kind === 'artist'} icon={kind === 'artist' ? 'mic' : 'disc'} /><Text style={base.eyebrow}>{kind === 'artist' ? 'ARTISTA' : 'ÁLBUM'}</Text><Text style={s.name}>{name || 'Sua música'}</Text><Text style={s.description}>{kind === 'artist' ? 'Músicas salvas e resultados encontrados para este artista.' : 'Músicas salvas e resultados encontrados para este álbum.'}</Text></View>
      <View style={s.actions}><ActionButton disabled={!tracks.length} label="Reproduzir" icon="play" onPress={() => { if (tracks[0]) void playTrack(tracks[0], tracks); }} /><IconButton name="add-circle-outline" label="Salvar músicas em uma nova playlist" disabled={!tracks.length} onPress={() => { const id = createPlaylist(name, tracks); notify('Playlist criada com as músicas encontradas.'); router.push({ pathname: '/playlist/[id]', params: { id } }); }} /></View>
      {error && tracks.length > 0 && <EmptyState title="Não foi possível atualizar" description="As músicas da sua biblioteca continuam disponíveis abaixo." action="Tentar novamente" onAction={() => void load()} />}
      {tracks.length > 0 && <Text style={s.section}>Músicas encontradas</Text>}
    </>}
    ListEmptyComponent={<EmptyState loading={loading} title={loading ? 'Encontrando músicas…' : error ? 'Não foi possível carregar' : 'Nenhuma música encontrada'} description={loading ? undefined : error ? 'Confira sua conexão e tente novamente.' : 'Experimente buscar pelo nome de uma música.'} action={loading ? undefined : error ? 'Tentar novamente' : 'Buscar músicas'} onAction={() => error ? void load() : router.push({ pathname: '/search', params: { q: name } })} />}
  /></View>;
}

const s = StyleSheet.create({
  top: { paddingHorizontal: 10, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  topLabel: { color: colors.muted, fontSize: 10, letterSpacing: 1.5, fontWeight: '800' },
  hero: { marginHorizontal: 20, borderRadius: 24, backgroundColor: '#27362c', padding: 24, alignItems: 'center', gap: 16 },
  name: { color: colors.text, textAlign: 'center', fontSize: 33, lineHeight: 39, fontWeight: '800', letterSpacing: -.8 },
  description: { color: colors.muted, fontSize: 12, textAlign: 'center', lineHeight: 20, maxWidth: 290 },
  actions: { padding: 20, flexDirection: 'row', alignItems: 'center', gap: 12 },
  section: { paddingHorizontal: 20, color: colors.text, fontSize: 21, fontWeight: '800', marginBottom: 14 },
});

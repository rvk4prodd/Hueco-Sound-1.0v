import React, { useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { usePlayerStore } from '../player/usePlayerStore';
import { useUIStore } from '../ui/useUIStore';
import { useDeviceLibraryStore } from '../library/useDeviceLibraryStore';
import { colors } from '../theme';
import { ActionButton, Chip, ConfirmDialog, Cover, EmptyState, IconButton, NameDialog, screenStyles as base } from './ScreenParts';
import { SmartPlaylistModal } from '../components/SmartPlaylistModal';

type LibraryItem = { id: string; name: string; count: number; updatedAt: number; coverUrl?: string; type: 'playlist' | 'artist' | 'album'; icon?: 'heart' | 'time' | 'albums' | 'phone-portrait'; fixed?: boolean };
const SORTS = ['Recentes', 'Nome', 'Mais músicas'] as const;

export function LibraryScreen() {
  const playlists = usePlayerStore(s => s.playlists);
  const likedTracks = usePlayerStore(s => s.likedTracks);
  const recentTracks = usePlayerStore(s => s.recentTracks);
  const createPlaylist = usePlayerStore(s => s.createPlaylist);
  const renamePlaylist = usePlayerStore(s => s.renamePlaylist);
  const deletePlaylist = usePlayerStore(s => s.deletePlaylist);
  const notify = useUIStore(s => s.notify);
  const localTracks = useDeviceLibraryStore(s => s.localTracks);
  const [filter, setFilter] = useState('playlist');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState(0);
  const [naming, setNaming] = useState<{ id?: string; name: string } | null>(null);
  const [selected, setSelected] = useState<LibraryItem | null>(null);
  const [deleting, setDeleting] = useState<LibraryItem | null>(null);
  const [showSmartModal, setShowSmartModal] = useState(false);

  const items = useMemo<LibraryItem[]>(() => {
    let result: LibraryItem[];
    if (filter === 'playlist') {
      result = [
        { id: 'liked', name: 'Músicas curtidas', count: likedTracks.length, updatedAt: 0, type: 'playlist', icon: 'heart', fixed: true },
        { id: 'recent', name: 'Tocadas recentemente', count: recentTracks.length, updatedAt: 0, type: 'playlist', icon: 'time', fixed: true },
        { id: 'device', name: 'Neste celular', count: localTracks.length, updatedAt: 0, type: 'playlist', icon: 'phone-portrait', fixed: true },
        ...playlists.map(p => ({ id: p.id, name: p.name, count: p.tracks.length, updatedAt: p.updatedAt, coverUrl: p.tracks[0]?.coverUrl, type: 'playlist' as const })),
      ];
    } else {
      const uniqueTracks = [...new Map([...likedTracks, ...recentTracks, ...localTracks, ...playlists.flatMap(p => p.tracks)].map(t => [t.id, t])).values()];
      const groups = new Map<string, LibraryItem>();
      for (const t of uniqueTracks) {
        const name = filter === 'artist' ? t.artists.split(/[•,&]/)[0].trim() : t.albumTitle;
        if (!name) continue;
        const previous = groups.get(name);
        groups.set(name, { id: name, name, count: (previous?.count ?? 0) + 1, coverUrl: previous?.coverUrl || t.coverUrl, updatedAt: 0, type: filter === 'artist' ? 'artist' : 'album' });
      }
      result = [...groups.values()];
    }
    const term = search.trim().toLocaleLowerCase();
    return result.filter(item => !term || item.name.toLocaleLowerCase().includes(term)).sort((a, b) => Number(!!b.fixed) - Number(!!a.fixed) || (sort === 1 ? a.name.localeCompare(b.name, 'pt-BR') : sort === 2 ? b.count - a.count : b.updatedAt - a.updatedAt));
  }, [filter, likedTracks, playlists, recentTracks, localTracks, search, sort]);

  const open = (item: LibraryItem) => item.type === 'playlist' ? router.push({ pathname: '/playlist/[id]', params: { id: item.id } }) : router.push({ pathname: '/collection', params: { kind: item.type, name: item.name } });
  const saveName = (name: string) => {
    if (naming?.id) { renamePlaylist(naming.id, name); notify('Nome da playlist atualizado.'); }
    else { const id = createPlaylist(name); notify('Playlist criada. Adicione suas músicas favoritas.'); router.push({ pathname: '/playlist/[id]', params: { id } }); }
    setNaming(null);
  };

  return <View style={base.screen}>
    <View style={base.header}><View style={s.avatar}><Text style={s.avatarText}>L</Text></View><View style={{ flex: 1 }}><Text style={base.eyebrow}>SEU ESPAÇO</Text><Text style={[base.title, { fontSize: 27 }]}>Biblioteca</Text></View><IconButton name="flash-outline" label="Smart Playlists" onPress={() => setShowSmartModal(true)} /><IconButton name="add" label="Criar playlist" onPress={() => setNaming({ name: '' })} /><IconButton name="settings-outline" label="Abrir configurações" onPress={() => router.push('/settings')} /></View>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={base.chips}>{[{ name: 'Playlists', key: 'playlist' }, { name: 'Artistas', key: 'artist' }, { name: 'Álbuns', key: 'album' }].map(item => <Chip key={item.key} label={item.name} active={filter === item.key} onPress={() => setFilter(item.key)} />)}</ScrollView>
    <View style={[base.inputWrap, { marginBottom: 8, height: 46 }]}><Ionicons name="search" size={19} color={colors.muted} /><TextInput accessibilityLabel="Filtrar biblioteca" value={search} onChangeText={setSearch} style={[base.input, { height: 46 }]} placeholder="Buscar na sua biblioteca" placeholderTextColor={colors.muted} returnKeyType="search" />{!!search && <IconButton name="close" label="Limpar filtro da biblioteca" onPress={() => setSearch('')} />}</View>
    <View style={s.sortRow}><Pressable accessibilityRole="button" accessibilityLabel={`Ordenar por ${SORTS[sort]}. Toque para mudar.`} onPress={() => setSort(v => (v + 1) % SORTS.length)} style={s.sortButton}><Ionicons name="swap-vertical" size={17} color={colors.muted} /><Text style={s.sortText}>{SORTS[sort]}</Text></Pressable><Text style={s.count}>{items.length} {items.length === 1 ? 'item' : 'itens'}</Text></View>
    <FlatList data={items} keyExtractor={item => `${item.type}:${item.id}`} contentContainerStyle={base.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" showsVerticalScrollIndicator={false} initialNumToRender={12} windowSize={5} renderItem={({ item }) => <View style={s.libraryRow}><Pressable accessibilityRole="button" onPress={() => open(item)} onLongPress={!item.fixed && item.type === 'playlist' ? () => setSelected(item) : undefined} style={s.openRow}><Cover uri={item.coverUrl} size={66} icon={item.icon || 'albums'} color={item.id === 'liked' ? '#5750aa' : item.id === 'recent' ? '#355347' : '#354332'} round={item.type === 'artist'} /><View style={{ flex: 1, gap: 6 }}><Text style={s.itemName} numberOfLines={1}>{item.name}</Text><Text style={s.itemMeta}>{item.type === 'artist' ? 'Artista' : item.type === 'album' ? 'Álbum' : 'Playlist'} · {item.count} {item.count === 1 ? 'música' : 'músicas'}</Text></View></Pressable>{!item.fixed && item.type === 'playlist' && <IconButton name="ellipsis-horizontal" label={`Opções de ${item.name}`} onPress={() => setSelected(item)} />}</View>}
      ListEmptyComponent={<EmptyState title={search ? 'Nada por aqui com esse nome' : filter === 'album' ? 'Os álbuns aparecem aqui' : 'Sua coleção começa com um play'} description={search ? 'Tente outro nome ou limpe o filtro.' : 'Curta músicas, monte playlists e volte para ouvir seus favoritos.'} action={search ? 'Limpar filtro' : 'Explorar músicas'} onAction={() => search ? setSearch('') : router.push('/search')} />}
      ListFooterComponent={filter === 'playlist' && !search ? <View style={s.createRow}><ActionButton icon="add" secondary label="Criar uma playlist" onPress={() => setNaming({ name: '' })} /></View> : undefined}
    />
    <NameDialog visible={!!naming} title={naming?.id ? 'Renomear playlist' : 'Nova playlist'} initialValue={naming?.name} onClose={() => setNaming(null)} onSave={saveName} />
    <Modal transparent animationType="fade" visible={!!selected} onRequestClose={() => setSelected(null)}><View style={s.menuOverlay}><Pressable accessibilityLabel="Fechar opções" style={StyleSheet.absoluteFill} onPress={() => setSelected(null)} /><View accessibilityViewIsModal style={s.menu}><Text style={s.menuTitle} numberOfLines={2}>{selected?.name}</Text><ActionButton secondary icon="pencil" label="Renomear playlist" onPress={() => { if (selected) setNaming({ id: selected.id, name: selected.name }); setSelected(null); }} /><ActionButton secondary icon="trash-outline" label="Excluir playlist" onPress={() => { setDeleting(selected); setSelected(null); }} /><ActionButton label="Fechar" onPress={() => setSelected(null)} /></View></View></Modal>
    <ConfirmDialog visible={!!deleting} title="Excluir esta playlist?" description={`“${deleting?.name || ''}” será removida da sua biblioteca. As músicas curtidas continuam salvas.`} onClose={() => setDeleting(null)} onConfirm={() => { if (deleting) deletePlaylist(deleting.id); setDeleting(null); notify('Playlist excluída.'); }} />
    <SmartPlaylistModal visible={showSmartModal} onClose={() => setShowSmartModal(false)} />
  </View>;
}

const s = StyleSheet.create({
  avatar: { width: 43, height: 43, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accent, marginRight: 4 },
  avatarText: { color: '#162210', fontWeight: '900', fontSize: 23 },
  sortRow: { paddingHorizontal: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 },
  sortButton: { flexDirection: 'row', gap: 7, alignItems: 'center', minHeight: 44 },
  sortText: { color: colors.muted, fontWeight: '600', fontSize: 12 },
  count: { color: colors.muted, fontSize: 11 },
  libraryRow: { paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center' },
  openRow: { flexDirection: 'row', alignItems: 'center', gap: 14, flex: 1, paddingVertical: 10 },
  itemName: { color: colors.text, fontSize: 16, fontWeight: '700' },
  itemMeta: { color: colors.muted, fontSize: 12 },
  createRow: { alignItems: 'flex-start', paddingHorizontal: 20, paddingTop: 22 },
  menuOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: '#00000088' },
  menu: { padding: 24, paddingBottom: 32, borderTopLeftRadius: 26, borderTopRightRadius: 26, backgroundColor: colors.elevated, gap: 12, maxWidth: 560, width: '100%', alignSelf: 'center' },
  menuTitle: { color: colors.text, fontSize: 22, fontWeight: '800', marginBottom: 9 },
});

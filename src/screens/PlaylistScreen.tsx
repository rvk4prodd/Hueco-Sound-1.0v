import React, { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { usePlayerStore } from '../player/usePlayerStore';
import { useUIStore } from '../ui/useUIStore';
import { useDeviceLibraryStore } from '../library/useDeviceLibraryStore';
import { importLocalTracks } from '../library/transfers';
import { downloadPlaylist } from '../library/downloads';
import { PlaylistMixStudio } from '../components/PlaylistMixStudio';
import { SongRow } from '../components/SongRow';
import { colors } from '../theme';
import { ActionButton, ConfirmDialog, Cover, EmptyState, IconButton, NameDialog, screenStyles as base } from './ScreenParts';

export function PlaylistScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const id = typeof params.id === 'string' ? params.id : '';
  const playlists = usePlayerStore(s => s.playlists);
  const likedTracks = usePlayerStore(s => s.likedTracks);
  const recentTracks = usePlayerStore(s => s.recentTracks);
  const playTrack = usePlayerStore(s => s.playTrack);
  const currentTrack = usePlayerStore(s => s.currentTrack);
  const isPlaying = usePlayerStore(s => s.isPlaying);
  const togglePlayPause = usePlayerStore(s => s.togglePlayPause);
  const shuffle = usePlayerStore(s => s.shuffle);
  const toggleShuffle = usePlayerStore(s => s.toggleShuffle);
  const renamePlaylist = usePlayerStore(s => s.renamePlaylist);
  const deletePlaylist = usePlayerStore(s => s.deletePlaylist);
  const removeTrack = usePlayerStore(s => s.removeTrackFromPlaylist);
  const moveTrack = usePlayerStore(s => s.movePlaylistTrack);
  const updatePlaylistMixSettings = usePlayerStore(s => s.updatePlaylistMixSettings);
  const clearHistory = usePlayerStore(s => s.clearHistory);
  const notify = useUIStore(s => s.notify);
  const localTracks = useDeviceLibraryStore(s => s.localTracks);
  const removeLocalTrack = useDeviceLibraryStore(s => s.removeTrack);
  const [importing, setImporting] = useState(false);
  const [downloadingState, setDownloadingState] = useState<{ current: number; total: number } | null>(null);
  const [mixStudioOpen, setMixStudioOpen] = useState(false);
  const [selectedPairIndex, setSelectedPairIndex] = useState(0);
  const [removingLocal, setRemovingLocal] = useState<{ id: string; title: string } | null>(null);
  const [filter, setFilter] = useState('');
  const [editing, setEditing] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const playlist = playlists.find(p => p.id === id);
  const isFixed = id === 'liked' || id === 'recent' || id === 'device';
  const playlistTracks = playlist?.tracks;
  const tracks = useMemo(() => id === 'liked' ? likedTracks : id === 'recent' ? recentTracks : id === 'device' ? localTracks : playlistTracks || [], [id, likedTracks, recentTracks, localTracks, playlistTracks]);
  const name = id === 'liked' ? 'Músicas curtidas' : id === 'recent' ? 'Seu histórico' : id === 'device' ? 'Neste celular' : playlist?.name || 'Playlist';
  const filtered = useMemo(() => { const term = filter.trim().toLocaleLowerCase(); return tracks.filter(t => !term || `${t.title} ${t.artists}`.toLocaleLowerCase().includes(term)); }, [filter, tracks]);
  const duration = tracks.reduce((n, t) => n + (t.durationMs || 0), 0);
  const active = !!currentTrack && tracks.some(t => t.id === currentTrack.id) && isPlaying;
  const back = () => router.canGoBack() ? router.back() : router.replace('/library');
  const add = () => {
    if (id === 'device') { if (importing) return; setImporting(true); void importLocalTracks().then(count => { if (count) notify(`${count} músicas importadas.`); }).catch(e => notify(e instanceof Error ? e.message : 'Não foi possível importar.')).finally(() => setImporting(false)); }
    else router.push({ pathname: '/search', params: !isFixed ? { playlistId: id } : {} });
  };
  const play = () => { if (active) void togglePlayPause(); else if (filtered.length) void playTrack(filtered[shuffle ? Math.floor(Math.random() * filtered.length) : 0], filtered, !isFixed ? id : undefined); };

  const startDownloadAll = () => {
    if (downloadingState || !tracks.length) return;
    setDownloadingState({ current: 0, total: tracks.length });
    notify(`Iniciando download de ${tracks.length} músicas...`);
    void downloadPlaylist(id, tracks, p => {
      setDownloadingState({ current: p.current, total: p.total });
    }).then(result => {
      if (result.failed > 0) {
        notify(`${result.success} músicas salvas (${result.failed} falharam).`);
      } else {
        notify(`Todas as ${result.success} músicas foram salvas offline!`);
      }
    }).catch(e => {
      notify(e instanceof Error ? e.message : 'Não foi possível baixar.');
    }).finally(() => {
      setDownloadingState(null);
    });
  };

  if (!isFixed && !playlist) return <View style={base.screen}><View style={base.header}><IconButton name="arrow-back" label="Voltar" onPress={back} /></View><EmptyState title="Playlist não encontrada" description="Ela pode ter sido removida da sua biblioteca." action="Voltar à biblioteca" onAction={() => router.replace('/library')} /></View>;

  return <View style={base.screen}><FlatList style={{ flex: 1 }} data={filtered} keyExtractor={t => t.id} initialNumToRender={12} windowSize={7} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={base.content}
    ListHeaderComponent={<>
      <View style={s.top}><IconButton name="arrow-back" label="Voltar" onPress={back} /><Text style={s.topLabel}>{id === 'recent' ? 'HISTÓRICO' : 'SUA BIBLIOTECA'}</Text>{!isFixed || id === 'device' ? <IconButton name={editing ? 'checkmark' : 'create-outline'} label={editing ? 'Concluir edição' : id === 'device' ? 'Gerenciar arquivos locais' : 'Editar playlist e ordem das músicas'} onPress={() => setEditing(v => !v)} /> : <View style={{ width: 44 }} />}</View>
      <View style={[s.hero, id === 'liked' && { backgroundColor: '#282b44' }]}><Cover uri={!isFixed ? tracks[0]?.coverUrl : undefined} size={170} icon={id === 'liked' ? 'heart' : id === 'recent' ? 'time' : id === 'device' ? 'phone-portrait' : 'albums'} color={id === 'liked' ? '#6a61b8' : '#43664d'} /><Text style={s.playlistType}>{isFixed ? 'SUA COLEÇÃO' : 'PLAYLIST PESSOAL'}</Text><Text style={s.name}>{name}</Text><Text style={s.description}>{id === 'liked' ? 'Os sons que têm um lugar só seu.' : id === 'recent' ? 'Volte para as músicas que passaram por aqui.' : id === 'device' ? 'Arquivos salvos no aparelho. Sua música até sem conexão.' : playlist?.description || 'Um pouco de tudo que faz seu dia soar melhor.'}</Text><Text style={s.meta}>{tracks.length} {tracks.length === 1 ? 'música' : 'músicas'}{duration > 0 ? ` · ${Math.ceil(duration / 60_000)} min` : ''}</Text></View>
      {downloadingState && (
        <View style={s.downloadBanner}>
          <Ionicons name="cloud-download-outline" size={16} color={colors.accent} />
          <Text style={s.downloadBannerText}>
            Baixando músicas para ouvir offline ({downloadingState.current} de {downloadingState.total})...
          </Text>
        </View>
      )}
      <View style={s.controls}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          {(!isFixed || id === 'device') && <IconButton name="add-circle-outline" disabled={importing} label={id === 'device' ? 'Importar arquivos de áudio' : 'Adicionar músicas à playlist'} onPress={add} />}
          <IconButton name="shuffle" label={shuffle ? 'Desativar ordem aleatória' : 'Ativar ordem aleatória'} color={shuffle ? colors.accent : colors.muted} onPress={toggleShuffle} />
          {id !== 'device' && tracks.length > 0 && (
            <IconButton
              name={downloadingState ? 'cloud-download' : 'arrow-down-circle-outline'}
              label={downloadingState ? `Baixando ${downloadingState.current}/${downloadingState.total}` : 'Baixar todas as músicas da playlist'}
              color={downloadingState ? colors.accent : colors.muted}
              disabled={!!downloadingState}
              onPress={startDownloadAll}
            />
          )}
          {!isFixed && playlist && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Abrir mixagem da playlist"
              style={[s.mixButton, playlist.mixSettings?.enabled && s.mixButtonActive]}
              onPress={() => {
                setSelectedPairIndex(0);
                setMixStudioOpen(true);
              }}
            >
              <Ionicons name="options-outline" size={16} color={playlist.mixSettings?.enabled ? '#000' : colors.accent} />
              <Text style={[s.mixButtonText, playlist.mixSettings?.enabled && s.mixButtonTextActive]}>
                {playlist.mixSettings?.enabled ? 'Com Mix' : 'Sem Mix'}
              </Text>
            </Pressable>
          )}
          {id === 'recent' && tracks.length > 0 && <IconButton name="trash-outline" label="Limpar histórico" onPress={() => setDeleting(true)} />}
        </View>
        <ActionButton disabled={!filtered.length} label={active ? 'Pausar' : 'Reproduzir'} icon={active ? 'pause' : 'play'} onPress={play} />
      </View>
      {editing && !isFixed && <View style={s.editPanel}><Text style={s.editTitle}>Organize sua playlist</Text><Text style={base.subtitle}>Use as setas nas músicas para mudar a ordem.</Text><View style={s.editActions}><ActionButton secondary icon="pencil" label="Renomear" onPress={() => setRenaming(true)} /><ActionButton secondary icon="trash-outline" label="Excluir" onPress={() => setDeleting(true)} /></View></View>}
      {editing && id === 'device' && <View style={s.editPanel}><Text style={s.editTitle}>Arquivos do aparelho</Text><Text style={base.subtitle}>Remova da coleção os arquivos que não quiser mais ouvir por aqui.</Text></View>}
      {tracks.length > 0 && <View style={base.inputWrap}><Ionicons name="search" color={colors.muted} size={19} /><TextInput accessibilityLabel="Buscar nesta playlist" style={base.input} value={filter} onChangeText={setFilter} placeholder="Buscar nesta playlist" placeholderTextColor={colors.muted} />{!!filter && <IconButton name="close" label="Limpar busca na playlist" onPress={() => setFilter('')} />}</View>}
    </>}
    renderItem={({ item, index }) => {
      const originalIndex = tracks.findIndex(t => t.id === item.id);
      return (
        <View key={item.id}>
          <SongRow
            track={item}
            index={index + 1}
            playlistId={!isFixed ? id : undefined}
            onPress={() => void playTrack(item, filtered, !isFixed ? id : undefined)}
            rightAccessory={editing && id === 'device' ? <IconButton name="remove-circle-outline" color={colors.danger} label={`Remover ${item.title} da coleção local`} onPress={() => setRemovingLocal({ id: item.id, title: item.title })} /> : undefined}
          />
          {!editing && !isFixed && playlist?.mixSettings?.enabled && index < filtered.length - 1 && (
            <View style={s.bridgeContainer}>
              <View style={s.bridgeLine} />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Configurar transição entre ${item.title} e ${filtered[index + 1]?.title}`}
                onPress={() => {
                  setSelectedPairIndex(index);
                  setMixStudioOpen(true);
                }}
                style={({ pressed }) => [s.bridgePill, pressed && { opacity: 0.75, transform: [{ scale: 0.98 }] }]}
              >
                <Ionicons name="git-merge-outline" size={12} color={colors.accent} />
                <Text style={s.bridgeText}>
                  {(() => {
                    const nextTrack = filtered[index + 1];
                    const pairKey = `${item.id}->${nextTrack?.id}`;
                    const conf = (playlist.mixSettings?.customTransitions && playlist.mixSettings.customTransitions[pairKey]) || playlist.mixSettings?.defaultConfig;
                    const sec = conf?.durationSeconds ?? 4;
                    const presetLabel = conf?.preset === 'auto' ? 'AUTOMIX' : conf?.preset === 'fade' ? 'CROSSFADE' : conf?.preset === 'rise' ? 'CRESCENDO' : conf?.preset === 'blend' ? 'BLEND' : 'MIX';
                    return `${sec}s • ${presetLabel}`;
                  })()}
                </Text>
                <View style={s.bridgeBadge}>
                  <Text style={s.bridgeBadgeText}>Mix</Text>
                </View>
              </Pressable>
              <View style={s.bridgeLine} />
            </View>
          )}
          {editing && !isFixed && (
            <View style={s.trackEdit}>
              <View style={s.moveButtons}>
                <IconButton name="arrow-up" label={`Mover ${item.title} para cima`} disabled={originalIndex === 0} onPress={() => moveTrack(id, originalIndex, originalIndex - 1)} />
                <IconButton name="arrow-down" label={`Mover ${item.title} para baixo`} disabled={originalIndex === tracks.length - 1} onPress={() => moveTrack(id, originalIndex, originalIndex + 1)} />
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel={`Remover ${item.title} desta playlist`} onPress={() => { removeTrack(id, item.id); notify('Música removida da playlist.'); }} style={s.remove}>
                <Ionicons name="remove-circle-outline" color={colors.danger} size={18} />
                <Text style={s.removeText}>Remover</Text>
              </Pressable>
            </View>
          )}
        </View>
      );
    }}
    ListEmptyComponent={<EmptyState title={filter ? 'Nenhuma música com esse nome' : id === 'liked' ? 'Guarde suas favoritas' : id === 'recent' ? 'Seu próximo play fica aqui' : id === 'device' ? 'Sua música também offline' : 'Essa playlist é toda sua'} description={filter ? 'Tente outro título ou artista.' : id === 'liked' ? 'Toque no coração de uma música para encontrá-la aqui sempre que quiser.' : id === 'recent' ? 'As músicas que você ouvir aparecem neste histórico.' : id === 'device' ? 'Importe arquivos de áudio do aparelho para ouvir quando quiser.' : 'Adicione músicas pela busca. Depois, organize do seu jeito.'} action={filter ? 'Limpar busca' : importing ? 'Importando…' : id === 'device' ? 'Importar áudio' : 'Adicionar músicas'} onAction={() => filter ? setFilter('') : add()} />}
    ListFooterComponent={!isFixed && tracks.length > 0 ? <View style={s.addMore}><ActionButton secondary icon="add" label="Adicionar músicas" onPress={add} /></View> : undefined}
  />
  <NameDialog visible={renaming} title="Renomear playlist" initialValue={name} onClose={() => setRenaming(false)} onSave={value => { renamePlaylist(id, value); setRenaming(false); notify('Playlist renomeada.'); }} />
  <ConfirmDialog visible={!!removingLocal} title="Remover da coleção local?" description={`“${removingLocal?.title || ''}” será removida de “Neste celular”.`} confirmLabel="Remover" onClose={() => setRemovingLocal(null)} onConfirm={() => { const target = removingLocal; setRemovingLocal(null); if (target) void removeLocalTrack(target.id).then(() => notify('Música removida da coleção local.')).catch(() => notify('Não foi possível remover. Tente novamente.')); }} />
  <ConfirmDialog visible={deleting} title={id === 'recent' ? 'Limpar histórico?' : 'Excluir esta playlist?'} description={id === 'recent' ? 'As músicas tocadas recentemente serão removidas do histórico.' : `“${name}” será removida da sua biblioteca.`} confirmLabel={id === 'recent' ? 'Limpar' : 'Excluir'} onClose={() => setDeleting(false)} onConfirm={() => { setDeleting(false); if (id === 'recent') { clearHistory(); notify('Histórico limpo.'); } else { deletePlaylist(id); router.replace('/library'); notify('Playlist excluída.'); } }} />
  {playlist && (
    <PlaylistMixStudio
      visible={mixStudioOpen}
      playlist={playlist}
      initialPairIndex={selectedPairIndex}
      onClose={() => setMixStudioOpen(false)}
      onSave={settings => {
        updatePlaylistMixSettings(playlist.id, settings);
        notify('Mixagem da playlist salva com sucesso.');
      }}
    />
  )}
  </View>;
}

const s = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 10, paddingVertical: 6 },
  topLabel: { color: colors.muted, fontSize: 10, fontWeight: '800', letterSpacing: 1.7 },
  hero: { backgroundColor: '#233326', paddingHorizontal: 26, paddingTop: 12, paddingBottom: 26, alignItems: 'center', gap: 12, marginHorizontal: 16, borderRadius: 22 },
  downloadBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#2dd4bf22',
    borderWidth: 1,
    borderColor: '#2dd4bf55',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 14,
    marginHorizontal: 16,
    marginTop: 12,
  },
  downloadBannerText: { color: colors.accent, fontSize: 12, fontWeight: '700', flex: 1 },
  playlistType: { color: colors.accent, fontSize: 10, fontWeight: '800', letterSpacing: 1.8, marginTop: 7 },
  name: { color: colors.text, fontSize: 31, fontWeight: '800', letterSpacing: -.7, textAlign: 'center' },
  description: { color: '#c0c8ba', fontSize: 13, lineHeight: 20, textAlign: 'center', maxWidth: 300 },
  meta: { color: colors.muted, fontSize: 12 },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 20 },
  mixButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
  },
  mixButtonActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  mixButtonText: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: '700',
  },
  mixButtonTextActive: {
    color: '#000',
  },
  editPanel: { marginHorizontal: 20, padding: 17, borderRadius: 16, backgroundColor: colors.surface, marginBottom: 20, gap: 9 },
  editTitle: { color: colors.text, fontSize: 16, fontWeight: '700' },
  editActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 7 },
  trackEdit: { marginLeft: 20, marginRight: 20, paddingLeft: 6, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: colors.border },
  moveButtons: { flexDirection: 'row' },
  remove: { flexDirection: 'row', gap: 7, minHeight: 44, alignItems: 'center', paddingHorizontal: 8 },
  removeText: { color: colors.danger, fontSize: 12, fontWeight: '700' },
  addMore: { padding: 20, alignItems: 'flex-start' },
  bridgeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
    paddingHorizontal: 20,
  },
  bridgeLine: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  bridgePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#18181c',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderRadius: 20,
    marginHorizontal: 8,
  },
  bridgeText: {
    color: 'rgba(255, 255, 255, 0.75)',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  bridgeBadge: {
    backgroundColor: 'rgba(45, 212, 191, 0.18)',
    paddingVertical: 1.5,
    paddingHorizontal: 6,
    borderRadius: 8,
  },
  bridgeBadgeText: {
    color: colors.accent,
    fontSize: 9,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
});

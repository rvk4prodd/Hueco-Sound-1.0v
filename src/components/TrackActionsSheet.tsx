import React, { useState } from 'react';
import { Modal, View, Text, Pressable, ScrollView, StyleSheet, TextInput, Share, KeyboardAvoidingView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useUIStore } from '../ui/useUIStore';
import { usePlayerStore } from '../player/usePlayerStore';
import { useDeviceLibraryStore } from '../library/useDeviceLibraryStore';
import { colors } from '../theme';
import { downloadTrack } from '../library/downloads';
import { Cover } from './Cover';
type IconName = keyof typeof Ionicons.glyphMap;
function Action({ icon, text, onPress, danger }: { icon: IconName; text: string; onPress: () => void; danger?: boolean }) { return <Pressable accessibilityRole="button" onPress={onPress} style={styles.action}><Ionicons name={icon} size={22} color={danger ? colors.danger : colors.muted} /><Text style={[styles.actionText, danger && { color: colors.danger }]}>{text}</Text></Pressable>; }
export function TrackActionsSheet() {
 const track = useUIStore((s) => s.actionTrack), playlistId = useUIStore((s) => s.actionPlaylistId), close = useUIStore((s) => s.closeTrackActions), notify = useUIStore((s) => s.notify);
 const playlists = usePlayerStore((s) => s.playlists), liked = usePlayerStore((s) => track ? s.likedTrackIds.includes(track.id) : false);
 const like = usePlayerStore((s) => s.toggleLike), addQueue = usePlayerStore((s) => s.addToQueue), playNext = usePlayerStore((s) => s.playNext), addPlaylist = usePlayerStore((s) => s.addTrackToPlaylist), createPlaylist = usePlayerStore((s) => s.createPlaylist), removePlaylist = usePlayerStore((s) => s.removeTrackFromPlaylist);
 const insets = useSafeAreaInsets(), [mode, setMode] = useState<'actions' | 'playlists' | 'create'>('actions'), [name, setName] = useState('');
 if (!track) return null;
 const done = (message: string) => { close(); notify(message); };
 const navigateCollection = (kind: 'artist' | 'album', value: string) => { usePlayerStore.getState().setIsFullscreenOpen(false); close(); router.push({ pathname: '/collection', params: { kind, name: value } }); };
 return <Modal visible transparent animationType="fade" onShow={() => { setMode('actions'); setName(''); }} onRequestClose={() => mode === 'actions' ? close() : setMode('actions')} statusBarTranslucent>
 <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.overlay}><Pressable accessibilityRole="button" accessibilityLabel="Fechar opções" style={StyleSheet.absoluteFill} onPress={close} />
 <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}><View style={styles.grabber} />
 <View style={styles.track}><Cover uri={track.coverUrl} seed={track.id} size={54} /><View style={{ flex: 1 }}><Text numberOfLines={2} style={styles.title}>{track.title}</Text><Text numberOfLines={1} style={styles.muted}>{track.artists}</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Fechar opções" onPress={close} style={styles.close}><Ionicons name="close" size={24} color={colors.text} /></Pressable></View>
 <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 8 }}>
 {mode === 'actions' ? <>
 <Action icon={liked ? 'heart' : 'heart-outline'} text={liked ? 'Remover das curtidas' : 'Salvar nas curtidas'} onPress={() => { like(track); done(liked ? 'Removida das curtidas' : 'Salva nas curtidas'); }} />
 <Action icon="add-circle-outline" text="Adicionar à playlist" onPress={() => setMode('playlists')} />
 <Action icon="play-forward-outline" text="Tocar a seguir" onPress={() => { playNext(track); done(usePlayerStore.getState().queue.some((t) => t.id === track.id) ? (usePlayerStore.getState().currentTrack?.id === track.id ? 'Esta música já está tocando' : 'Vai tocar a seguir') : usePlayerStore.getState().error || 'Não foi possível adicionar à fila'); }} />
 <Action icon="list-outline" text="Adicionar à fila" onPress={() => { const already = usePlayerStore.getState().queue.some((t) => t.id === track.id); addQueue(track); done(usePlayerStore.getState().queue.some((t) => t.id === track.id) ? already ? 'Esta música já está na fila' : 'Adicionada à fila' : usePlayerStore.getState().error || 'Não foi possível adicionar à fila'); }} />
 {track.source !== 'local' && <Action icon="download-outline" text="Salvar para ouvir offline" onPress={() => { close(); notify('Preparando download…'); void downloadTrack(track).then(() => notify('Música salva em Biblioteca → Neste celular')).catch((error: unknown) => notify(error instanceof Error ? error.message : 'Não foi possível baixar esta música.')); }} />}
 <Action icon="person-outline" text="Explorar artista" onPress={() => navigateCollection('artist', track.artists.split(/[,•]/)[0].trim())} />
 {track.albumTitle && <Action icon="disc-outline" text="Explorar álbum" onPress={() => navigateCollection('album', track.albumTitle!)} />}
 {track.source !== 'local' && <Action icon="share-outline" text="Compartilhar música" onPress={() => {
 const id = track.id.replace(/^yt:/, ''); const url = /^[a-zA-Z0-9_-]{11}$/.test(id) ? `https://music.youtube.com/watch?v=${id}` : undefined;
 void Share.share({ message: `${track.title} — ${track.artists}${url ? '\n' + url : ''}` }).catch(() => notify('Não foi possível abrir o compartilhamento.')); close();
 }} />}
 {playlistId && !['liked','recent','device'].includes(playlistId) && <Action icon="remove-circle-outline" text="Remover desta playlist" danger onPress={() => { removePlaylist(playlistId, track.id); done('Removida da playlist'); }} />}
 {track.source === 'local' && <Action icon="remove-circle-outline" text="Remover da biblioteca do aparelho" danger onPress={() => { void useDeviceLibraryStore.getState().removeTrack(track.id).then(() => done('Removida da biblioteca do aparelho')).catch(() => notify('Não foi possível salvar a alteração.')); }} />}
 </> : mode === 'playlists' ? <>
 <Action icon="arrow-back" text="Voltar" onPress={() => setMode('actions')} />
 <Text style={styles.heading}>Escolha uma playlist</Text><Action icon="add-circle" text="Criar playlist" onPress={() => setMode('create')} />
 {playlists.length === 0 && <Text style={styles.empty}>Crie sua primeira playlist para guardar esta música.</Text>}
 {playlists.map((p) => <Action key={p.id} icon="musical-notes-outline" text={`${p.name}${p.tracks.some((t) => t.id === track.id) ? ' • já adicionada' : ''}`} onPress={() => { const added = addPlaylist(p.id, track); done(added ? `Adicionada a ${p.name}` : p.tracks.some((t) => t.id === track.id) ? 'Esta música já está na playlist' : usePlayerStore.getState().error || 'Não foi possível adicionar à playlist'); }} />)}
 </> : <View style={styles.create}><Text style={styles.heading}>O nome do seu novo mix</Text><TextInput accessibilityLabel="Nome da nova playlist" autoFocus value={name} onChangeText={setName} maxLength={100} placeholder="Minha playlist" placeholderTextColor={colors.muted} style={styles.input} onSubmitEditing={() => { if (!name.trim()) return; const id = createPlaylist(name.trim(), [track]); done(id ? 'Playlist criada com esta música' : usePlayerStore.getState().error || 'Não foi possível criar a playlist'); }} />
 <Pressable accessibilityRole="button" disabled={!name.trim()} onPress={() => { createPlaylist(name.trim(), [track]); done('Playlist criada com esta música'); }} style={[styles.createButton, !name.trim() && { opacity: 0.4 }]}><Text style={styles.createLabel}>Criar e adicionar música</Text></Pressable><Action icon="arrow-back" text="Voltar às playlists" onPress={() => setMode('playlists')} /></View>}
 </ScrollView></View></KeyboardAvoidingView></Modal>;
}
const styles = StyleSheet.create({ overlay: { flex: 1, backgroundColor: '#00000099', justifyContent: 'flex-end' }, sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '85%', paddingTop: 10 }, grabber: { backgroundColor: colors.border, height: 4, width: 36, borderRadius: 2, alignSelf: 'center', marginBottom: 12 }, track: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingBottom: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }, title: { color: colors.text, fontSize: 15, fontWeight: '700' }, muted: { color: colors.muted, marginTop: 5, fontSize: 12 }, close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }, action: { minHeight: 56, paddingHorizontal: 24, flexDirection: 'row', alignItems: 'center', gap: 18 }, actionText: { color: colors.text, fontSize: 14, flex: 1 }, heading: { fontSize: 20, fontWeight: '700', color: colors.text, marginHorizontal: 24, marginVertical: 14 }, empty: { color: colors.muted, fontSize: 14, paddingHorizontal: 24, paddingVertical: 18, lineHeight: 22 }, create: { paddingVertical: 8 }, input: { color: colors.text, backgroundColor: colors.elevated, padding: 16, fontSize: 18, marginHorizontal: 24, borderRadius: 12 }, createButton: { backgroundColor: colors.accent, padding: 16, borderRadius: 28, margin: 24 }, createLabel: { color: colors.background, textAlign: 'center', fontWeight: '800' } });

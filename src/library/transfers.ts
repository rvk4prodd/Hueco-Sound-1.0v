import { Platform } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import { Directory, File, Paths } from 'expo-file-system';
import { usePlayerStore } from '../player/usePlayerStore';
import { useDeviceLibraryStore } from './useDeviceLibraryStore';
import { cleanRemoteTrack, parseBackup, type LibraryBackup } from './backup';
import type { Track } from '../types';

function requireNative() {
  if (Platform.OS === 'web') throw new Error('Use o aplicativo Android para importar e exportar arquivos.');
}

export async function exportLibrary(): Promise<void> {
  requireNative();
  if (!(await Sharing.isAvailableAsync())) throw new Error('O compartilhamento de arquivos não está disponível neste aparelho.');
  const { likedTracks, playlists } = usePlayerStore.getState();
  const remote = (tracks: Track[]) => tracks.map(cleanRemoteTrack).filter((t): t is Track => Boolean(t));
  const backup: LibraryBackup = {
    format: 'hueco-sound',
    version: 1,
    exportedAt: new Date().toISOString(),
    likedTracks: remote(likedTracks),
    playlists: playlists.map((p) => ({ name: p.name, description: p.description, tracks: remote(p.tracks) })),
  };
  const file = new File(Paths.cache, `hueco-biblioteca-${Date.now()}.json`);
  file.create({ overwrite: true });
  await file.write(JSON.stringify(backup, null, 2));
  try {
    await Sharing.shareAsync(file.uri, { mimeType: 'application/json', dialogTitle: 'Salvar backup do Hueco Sound', UTI: 'public.json' });
  } finally {
    if (file.exists) file.delete();
  }
}

export async function importLibrary(): Promise<number> {
  requireNative();
  const result = await DocumentPicker.getDocumentAsync({ type: ['application/json', 'text/plain', 'application/octet-stream'], copyToCacheDirectory: true });
  if (result.canceled) return 0;
  const file = new File(result.assets[0].uri);
  try {
    if ((file.size ?? 0) > 10 * 1024 * 1024) throw new Error('Escolha um backup de até 10 MB.');
    const backup = parseBackup(await file.text());
    usePlayerStore.getState().importLibraryData(backup);
    return backup.likedTracks.length + backup.playlists.length;
  } finally {
    if (file.exists && file.uri.startsWith(Paths.cache.uri)) file.delete();
  }
}

export async function importLocalTracks(): Promise<number> {
  requireNative();
  const result = await DocumentPicker.getDocumentAsync({ type: 'audio/*', multiple: true, copyToCacheDirectory: true });
  if (result.canceled) return 0;
  const directory = new Directory(Paths.document, 'hueco-audio');
  directory.create({ idempotent: true, intermediates: true });
  let count = 0;
  for (const asset of result.assets) {
    const source = new File(asset.uri);
    if ((asset.size ?? source.size ?? 0) > 250 * 1024 * 1024) throw new Error('Escolha arquivos de áudio de até 250 MB.');
    const extension = asset.name.match(/\.([a-z0-9]{1,5})$/i)?.[1] ?? 'mp3';
    const id = `local:${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const destination = new File(directory, `${id.replace(':', '-')}.${extension}`);
    await source.copy(destination);
    const name = asset.name.replace(/\.[^.]+$/, '');
    const parts = name.split(' - ');
    const track: Track = {
      id,
      title: parts.length > 1 ? parts.slice(1).join(' - ') : name,
      artists: parts.length > 1 ? parts[0] : 'Arquivo do aparelho',
      coverUrl: '',
      durationMs: 0,
      source: 'local',
      streamUrl: destination.uri,
    };
    try {
      await useDeviceLibraryStore.getState().addTracks([track]);
      count++;
    } catch (error) {
      if (destination.exists) destination.delete();
      throw error;
    } finally {
      if (source.exists && source.uri.startsWith(Paths.cache.uri)) source.delete();
    }
  }
  return count;
}

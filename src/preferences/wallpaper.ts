import { Platform } from 'react-native';

export async function saveWallpaper(uri: string, previousUri: string | null): Promise<string> {
  if (Platform.OS === 'web') return uri;
  const { Directory, File, Paths } = await import('expo-file-system');
  const folder = new Directory(Paths.document, 'wallpapers');
  folder.create({ idempotent: true, intermediates: true });
  const source = new File(uri);
  const saved = new File(folder, `background-${Date.now()}.image`);
  await source.copy(saved);
  if (previousUri && previousUri !== saved.uri) {
    try {
      const previous = new File(previousUri);
      if (previous.parentDirectory.uri === folder.uri && previous.exists) previous.delete();
    } catch { /* Only discard an older app-owned wallpaper when it is accessible. */ }
  }
  return saved.uri;
}

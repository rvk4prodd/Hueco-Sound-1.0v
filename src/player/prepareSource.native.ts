import { Directory, File, Paths } from 'expo-file-system';
import { googleAudioSize, MAX_PREPARED_AUDIO_BYTES, writeAudioChunks } from '../api/chunkedAudio';
import { ApiError, RequestCache, throwIfAborted, withDeadline } from '../api/transport';

const CACHE_BYTES = 96 * 1024 * 1024;
const CACHE_FILES = 16;
const pending = new RequestCache<string>(4);
const pinned = new Set<string>();
const reserved = new Map<string, number>();
const originals = new Map<string, string>();
const activeParts = new Map<string, number>();

function directory(): Directory {
  const result = new Directory(Paths.cache, 'liner-playback-v1');
  result.create({ idempotent: true, intermediates: true });
  return result;
}

function filename(url: string): string {
  const parsed = new URL(url);
  const identity = ['id', 'itag', 'clen', 'lmt'].map(key => parsed.searchParams.get(key) || '').join('|');
  const key = parsed.searchParams.get('id') ? identity : url;
  let hash = 2166136261;
  for (let index = 0; index < key.length; index++) hash = Math.imul(hash ^ key.charCodeAt(index), 16777619);
  const extension = /audio\/mp4/i.test(parsed.searchParams.get('mime') || '') || ['139', '140', '141'].includes(parsed.searchParams.get('itag') || '') ? 'm4a' : 'webm';
  return `${(hash >>> 0).toString(16)}.${extension}`;
}

function remember(file: File, original: string): string {
  originals.delete(file.uri);
  originals.set(file.uri, original);
  while (originals.size > 40) originals.delete(originals.keys().next().value!);
  reserved.set(file.uri, Date.now() + 30_000);
  return file.uri;
}

function trimCache(dir: Directory, incomingBytes: number, preserve: string): void {
  const now = Date.now();
  for (const [uri, expiry] of reserved) if (expiry <= now) reserved.delete(uri);
  const files = dir.list().filter((item): item is File => item instanceof File);
  for (const file of files) {
    if (file.name.endsWith('.part') && !activeParts.has(file.uri)) file.delete();
  }
  const completed = files.filter(file => !file.name.endsWith('.part'));
  completed.sort((a, b) => (a.modificationTime || 0) - (b.modificationTime || 0));
  let size = completed.reduce((sum, file) => sum + file.size, 0) + [...activeParts.values()].reduce((sum, bytes) => sum + bytes, 0);
  let count = completed.length + activeParts.size;
  for (const file of completed) {
    if (size + incomingBytes <= CACHE_BYTES && count < CACHE_FILES) break;
    if (file.uri === preserve || pinned.has(file.uri) || reserved.has(file.uri)) continue;
    size -= file.size; count--;
    file.delete(); originals.delete(file.uri);
  }
  if (size + incomingBytes > CACHE_BYTES || count >= CACHE_FILES) {
    throw new ApiError('Aguarde a preparação das músicas atuais antes de tentar novamente.', 'unavailable');
  }
}

async function prepare(url: string, size: number, signal: AbortSignal): Promise<string> {
  if (size > MAX_PREPARED_AUDIO_BYTES) throw new ApiError('Esta faixa excede o limite de cache de 32 MB.', 'unavailable');
  throwIfAborted(signal);
  const dir = directory();
  const target = new File(dir, filename(url));
  if (target.exists && target.size === size) return remember(target, url);
  if (target.exists) target.delete();
  trimCache(dir, size, target.uri);
  const part = new File(dir, `${target.name}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.part`);
  const partUri = part.uri;
  activeParts.set(partUri, size);
  let completed = false;
  try {
    part.create();
    const handle = part.open();
    try { await writeAudioChunks(url, size, bytes => handle.writeBytes(bytes), signal); }
    finally { handle.close(); }
    throwIfAborted(signal);
    if (part.size !== size) throw new ApiError('A preparação do áudio ficou incompleta.', 'invalid_response');
    if (target.exists) target.delete();
    await part.move(target);
    completed = true;
    return remember(target, url);
  } finally {
    activeParts.delete(partUri);
    // move changes the File URI, so only remove partial files on failure.
    if (!completed && part.exists) part.delete();
  }
}

/** Googlevideo can reject open-ended native requests while accepting bounded ranges. */
export async function preparePlaybackSource(url: string, signal?: AbortSignal): Promise<string> {
  const size = googleAudioSize(url);
  if (size === null) return url;
  // TTL zero: reuse complete files, but always recheck existence after OS cache eviction.
  return pending.get(filename(url), 0, shared => withDeadline(inner => prepare(url, size, inner), shared, 60_000), signal);
}

export function retainPreparedSources(urls: string[]): void {
  pinned.clear();
  for (const url of urls) if (url.startsWith('file:')) { pinned.add(url); reserved.delete(url); }
}

export function originalPlaybackSource(url: string): string { return originals.get(url) || url; }

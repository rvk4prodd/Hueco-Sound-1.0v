import { ApiError, request, throwIfAborted } from './transport';

export const AUDIO_CHUNK_BYTES = 256 * 1024;
export const MAX_PREPARED_AUDIO_BYTES = 32 * 1024 * 1024;

export function googleAudioSize(url: string): number | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || !parsed.hostname.endsWith('.googlevideo.com')) return null;
    const length = Number(parsed.searchParams.get('clen'));
    return Number.isSafeInteger(length) && length > 0 ? length : null;
  } catch { return null; }
}

/** Same bounded range-query strategy as desktop; never assemble the whole file in JS. */
export async function writeAudioChunks(
  url: string,
  size: number,
  write: (bytes: Uint8Array) => Promise<void>,
  signal?: AbortSignal,
): Promise<void> {
  if (!Number.isSafeInteger(size) || size <= 0 || size > MAX_PREPARED_AUDIO_BYTES) {
    throw new ApiError('O áudio excede o limite de preparação de 32 MB. Tente outra versão da faixa.', 'unavailable');
  }
  let chunkSize = AUDIO_CHUNK_BYTES;
  let start = 0;
  while (start < size) {
    throwIfAborted(signal);
    const end = Math.min(start + chunkSize, size) - 1;
    const expected = end - start + 1;
    const target = new URL(url);
    target.searchParams.set('range', `${start}-${end}`);
    let bytes: Uint8Array;
    try { bytes = await request(target.toString(), async response => {
      // Reject servers ignoring the range before allocating their response in JS.
      if (Number(response.headers.get('content-length')) !== expected) {
        await response.body?.cancel().catch(() => {});
        throw new ApiError('O provedor enviou um trecho de áudio incompleto.', 'invalid_response');
      }
      const type = response.headers.get('content-type') || '';
      if (type && !/^(audio\/|application\/octet-stream)/i.test(type)) {
        await response.body?.cancel().catch(() => {});
        throw new ApiError('O provedor não retornou áudio.', 'invalid_response');
      }
      const data = new Uint8Array(await response.arrayBuffer());
      if (data.byteLength !== expected) throw new ApiError('O trecho de áudio foi interrompido.', 'invalid_response');
      return data;
    }, { signal, timeoutMs: 8000, retries: 1 }); }
    catch (error) {
      // Some media sessions accept only small ranges after the first megabyte.
      // Retry the same offset once with small requests, never restart the file.
      if (error instanceof ApiError && error.status === 403 && expected > 16 * 1024 && chunkSize > 16 * 1024) {
        chunkSize = 16 * 1024;
        continue;
      }
      throw error;
    }
    throwIfAborted(signal);
    await write(bytes);
    start = end + 1;
  }
}

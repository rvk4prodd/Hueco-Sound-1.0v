// Local, bounded diagnostics. Only explicitly selected fields enter the report.
type Fields = Record<string, string | number | boolean | null>;
const entries: { at: string; event: string; data: Fields }[] = [];
export function tracePlayback(event: string, data: Fields = {}): void {
  entries.push({ at: new Date().toISOString(), event, data });
  if (entries.length > 100) entries.shift();
}
export function playbackTrace() { return entries.map(entry => ({ ...entry, data: { ...entry.data } })); }

export async function nativeDeadline<T>(operation: Promise<T>, phase: string, ms = 6000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([operation, new Promise<never>((_, reject) => {
      timer = setTimeout(() => { tracePlayback('native-timeout', { phase }); reject(new Error(`O player não respondeu: ${phase}.`)); }, ms);
    })]);
  } finally { clearTimeout(timer); }
}

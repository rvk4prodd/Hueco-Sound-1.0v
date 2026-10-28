export type LogLevel = 'info' | 'warn' | 'error';
export interface LogEntry { id: number; at: string; level: LogLevel; scope: string; message: string; }
const LIMIT = 300;
let entries: LogEntry[] = [], nextId = 0;
const listeners = new Set<() => void>();
let sink: ((text: string) => void) | undefined, timer: ReturnType<typeof setTimeout> | undefined;

export function redactLog(value: unknown): string {
  let text: string;
  try {
    const seen = new WeakSet<object>();
    text = typeof value === 'string' ? value : JSON.stringify(value, (key, item) => {
      if (/token|password|secret|authorization|cookie|visitor.?data|api.?key|client.?id/i.test(key)) return '[omitido]';
      if (item instanceof Error) return { name: item.name, message: item.message };
      if (item && typeof item === 'object') { if (seen.has(item)) return '[circular]'; seen.add(item); }
      return item;
    }) || String(value);
  } catch { text = '[registro indisponível]'; }
  return text
    .replace(/(?:https?|file|content):\/\/[^\s"'<>]+/gi, '[endereço omitido]')
    .replace(/[A-Z]:[\\/][^\r\n"'<>]+/gi, '[caminho omitido]')
    .replace(/\/(?:Users|home|data\/user|storage\/emulated)\/[^\s"'<>]+/gi, '[caminho omitido]')
    .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, '[email omitido]')
    .replace(/\b(?:Bearer\s+\S+|eyJ[\w-]+\.[\w-]+\.[\w-]+|gh[pousr]_[\w]+|github_pat_[\w]+)\b/gi, '[credencial omitida]')
    .replace(/(["']?(?:access[_-]?token|refresh[_-]?token|password|secret|authorization|cookie|api[_-]?key|visitor[_-]?data|signature|sig)["']?\s*[:=]\s*["']?)[^\s,;}"']+/gi, '$1[omitido]')
    .slice(0, 1600);
}
function changed() {
  listeners.forEach(listener => listener());
  if (sink && !timer) timer = setTimeout(() => { timer = undefined; sink?.(serializeLogs()); }, 2000);
}
export function addLog(level: LogLevel, scope: string, message: unknown): void {
  entries = [...entries, { id: ++nextId, at: new Date().toISOString(), level, scope: redactLog(scope).slice(0, 50), message: redactLog(message) }].slice(-LIMIT);
  changed();
}
export const getLogs = () => entries;
export function subscribeLogs(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
export function clearLogs() { entries = []; if (timer) clearTimeout(timer); timer = undefined; sink?.(serializeLogs()); changed(); }
export function serializeLogs(version?: string) { return JSON.stringify({ app: 'Hueco Sound', version: version ? redactLog(version) : undefined, format: 1, entries }, null, 2); }
export function restoreLogs(text: string | null): void {
  if (!text || text.length > 750000) return;
  try {
    const parsed = JSON.parse(text);
    if (parsed.format !== 1 || !Array.isArray(parsed.entries)) return;
    const restored: LogEntry[] = parsed.entries.slice(-LIMIT).filter((e: any) => e && ['info', 'warn', 'error'].includes(e.level) && typeof e.at === 'string' && Number.isFinite(Date.parse(e.at)) && typeof e.scope === 'string' && typeof e.message === 'string')
      .map((e: LogEntry) => ({ at: e.at, level: e.level, id: ++nextId, scope: redactLog(e.scope).slice(0, 50), message: redactLog(e.message) }));
    entries = [...restored, ...entries].slice(-LIMIT); changed();
  } catch { /* A damaged diagnostic file must not stop the app. */ }
}
export function persistLogs(save: (text: string) => void): () => void {
  sink = save;
  return () => { if (timer) clearTimeout(timer); timer = undefined; save(serializeLogs()); sink = undefined; };
}

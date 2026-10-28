import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addLog, clearLogs, getLogs, persistLogs, redactLog, restoreLogs, serializeLogs, subscribeLogs } from '../src/diagnostics/logs';
beforeEach(() => { clearLogs(); });
afterEach(() => { vi.useRealTimers(); });
describe('local diagnostic privacy and lifetime', () => {
  it('redacts credentials, URLs, paths and emails before storing or exporting', () => {
    addLog('error', 'playback', { error: new Error('https://audio.test/media?sig=private mail@example.test C:\\Users\\Private\\file.mp3'), access_token: 'FAKE_1', visitorData: 'FAKE_2', nested: { password: 'FAKE_3' } });
    const report = serializeLogs();
    for (const sensitive of ['audio.test', 'mail@example', 'Users', 'FAKE_1', 'FAKE_2', 'FAKE_3']) expect(report).not.toContain(sensitive);
    expect(report).toContain('omitido');
    expect(redactLog('"access_token": "secret-value", password=other-secret')).not.toMatch(/secret-value|other-secret/);
  });
  it('bounds history and notifies subscribers without changing a snapshot on read', () => {
    const change = vi.fn(), detach = subscribeLogs(change);
    for (let i = 0; i < 350; i++) addLog('info', 'test', String(i));
    expect(getLogs()).toHaveLength(300); expect(getLogs()[0].message).toBe('50');
    expect(getLogs()).toBe(getLogs()); expect(change).toHaveBeenCalledTimes(350); detach();
  });
  it('sanitizes restored history and drops unrecognized fields', () => {
    restoreLogs('{broken');
    restoreLogs(JSON.stringify({ format: 1, entries: [{ id: 1, at: new Date().toISOString(), level: 'error', scope: 'audio', message: 'https://private.test/x', access_token: 'leak' }, { level: 'invalid' }] }));
    expect(getLogs()).toHaveLength(1); expect(serializeLogs()).not.toMatch(/private.test|leak|access_token/);
  });
  it('persists a clear immediately and cannot resurrect an earlier pending snapshot', async () => {
    vi.useFakeTimers(); const write = vi.fn(), detach = persistLogs(write);
    addLog('info', 'audio', 'old'); clearLogs();
    expect(JSON.parse(write.mock.calls.at(-1)![0]).entries).toEqual([]);
    await vi.advanceTimersByTimeAsync(3000);
    expect(JSON.parse(write.mock.calls.at(-1)![0]).entries).toEqual([]); detach();
  });
});

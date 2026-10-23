import { afterEach, describe, expect, it, vi } from 'vitest';
import { AccountClient, fromCloudTrack, parseSession, toCloudTrack, validateCredentials } from '../src/account/client';
import type { AccountSession } from '../src/account/client';

const session = (name = 'one'): AccountSession => ({ accessToken: `access-${name}`, refreshToken: `refresh-${name}`, accessTokenExpiresAt: new Date(Date.now() + 3600000).toISOString(), user: { id: 'account-1', username: 'listener', displayName: 'Listener' } });
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
const storage = () => ({ read: vi.fn(async () => null as string | null), write: vi.fn(async (_value: string | null) => {}) });
const cloudTrack = { id: 'dQw4w9WgXcQ', title: 'Never Gonna Give You Up', artists: [{ id: 'UC1', name: 'Rick Astley' }], durationMs: 213000, cover: { url: 'https://cover.test/image', width: 300, height: 300 }, explicit: true, album: { id: 'album', title: 'Whenever You Need Somebody' } };
afterEach(() => vi.unstubAllGlobals());

describe('desktop authentication contract', () => {
  it('validates sign-up fields before a request and normalizes the exact payload', async () => {
    const client = new AccountClient(storage());
    const fetcher = vi.fn().mockResolvedValue(json(session()));
    vi.stubGlobal('fetch', fetcher);
    await expect(client.register({ email: 'bad', password: 'password', confirmation: 'password', username: 'user', displayName: 'User' })).rejects.toThrow('e-mail');
    expect(fetcher).not.toHaveBeenCalled();
    await client.register({ email: ' USER@EXAMPLE.COM ', password: 'password', confirmation: 'password', username: ' Listener ', displayName: ' Listener ' });
    expect(fetcher).toHaveBeenCalledWith('https://api.tryliner.fun/v1/auth/register', expect.objectContaining({ method: 'POST', body: JSON.stringify({ email: 'user@example.com', password: 'password', username: 'listener', displayName: 'Listener' }) }));
    expect(client.session?.user.id).toBe('account-1');
    expect(() => validateCredentials('u@test.com', 'password', { username: 'bad space', displayName: 'User', confirmation: 'password' })).toThrow('usuário');
    expect(() => parseSession({ accessToken: 'token' })).toThrow('sessão inválida');
  });
  it('deduplicates refresh calls and rotates both tokens together', async () => {
    const vault = storage();
    const client = new AccountClient(vault);
    client.session = session();
    const fetcher = vi.fn().mockResolvedValue(json(session('two')));
    vi.stubGlobal('fetch', fetcher);
    await Promise.all([client.refresh(), client.refresh(), client.refresh()]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(fetcher.mock.calls[0][1].body))).toEqual({ refreshToken: 'refresh-one' });
    expect(client.session?.accessToken).toBe('access-two');
    expect(client.session?.refreshToken).toBe('refresh-two');
    expect(vault.write).toHaveBeenCalledTimes(1);
  });
  it('keeps the session on service failure but clears a server-revoked refresh token', async () => {
    const client = new AccountClient(storage());
    client.session = session();
    const fetcher = vi.fn().mockResolvedValueOnce(json({ code: 'UNAVAILABLE' }, 503)).mockResolvedValueOnce(json({ code: 'INVALID_REFRESH_TOKEN' }, 401));
    vi.stubGlobal('fetch', fetcher);
    await expect(client.refresh()).rejects.toMatchObject({ status: 503 });
    expect(client.session?.accessToken).toBe('access-one');
    await expect(client.refresh()).rejects.toMatchObject({ backendCode: 'INVALID_REFRESH_TOKEN' });
    expect(client.session).toBeNull();
  });
  it('does not restore a session from a refresh that finishes after logout', async () => {
    const vault = storage();
    const client = new AccountClient(vault);
    client.session = session();
    let complete!: (response: Response) => void;
    vi.stubGlobal('fetch', vi.fn((url: string) => url.endsWith('/refresh') ? new Promise<Response>(resolve => { complete = resolve; }) : Promise.resolve(json({}, 200))));
    const refresh = client.refresh();
    await client.logout();
    complete(json(session('late')));
    await refresh;
    expect(client.session).toBeNull();
    expect(vault.write).toHaveBeenLastCalledWith(null);
  });
  it('surfaces secure-storage failure without storing tokens elsewhere', async () => {
    const vault = storage();
    vault.write.mockRejectedValue(new Error('keychain unavailable'));
    const warning = vi.fn();
    const client = new AccountClient(vault, () => {}, warning);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(session())));
    await client.login('user@example.com', 'password');
    expect(client.session?.user.id).toBe('account-1');
    expect(warning).toHaveBeenCalledTimes(1);
  });
  it('retries an authorized GET once after 401 with the newly rotated token', async () => {
    const client = new AccountClient(storage());
    client.session = session();
    const fetcher = vi.fn().mockResolvedValueOnce(json({ code: 'EXPIRED' }, 401)).mockResolvedValueOnce(json(session('two'))).mockResolvedValueOnce(json(session().user));
    vi.stubGlobal('fetch', fetcher);
    await expect(client.profile()).resolves.toMatchObject({ id: 'account-1' });
    expect(fetcher.mock.calls[2][1].headers.Authorization).toBe('Bearer access-two');
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
});

describe('explicit cloud library transfer', () => {
  it('imports all liked pages and ordered playlist snapshots with stable account-specific IDs', async () => {
    const client = new AccountClient(storage());
    client.session = session();
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      expect(init?.method || 'GET').toBe('GET');
      if (url.includes('library/tracks?limit=100&cursor=')) return json({ items: [{ track: cloudTrack }], nextCursor: null });
      if (url.includes('library/tracks?limit=100')) return json({ items: [{ track: cloudTrack }, { track: { id: 'unsupported' } }], nextCursor: 'cursor one' });
      if (url.endsWith('/v1/me/playlists')) return json({ items: [{ id: 'list-1' }] });
      if (url.endsWith('/v1/me/playlists/list-1')) return json({ playlist: { id: 'list-1', title: 'My PC playlist', createdAt: '2026-01-01', updatedAt: '2026-01-02' }, items: [{ position: 2, track: { ...cloudTrack, id: 'lYBUbBu4W08', title: 'Second' } }, { position: 1, track: cloudTrack }] });
      throw new Error('Unexpected endpoint');
    });
    vi.stubGlobal('fetch', fetcher);
    const first = await client.pullLibrary();
    const second = await client.pullLibrary();
    expect(first.likedTracks).toHaveLength(1);
    expect(first.skippedTracks).toBe(1);
    expect(first.playlists[0].id).toBe('cloud:account-1:list-1');
    expect(second.playlists[0].id).toBe(first.playlists[0].id);
    expect(first.playlists[0].tracks.map(track => track.title)).toEqual(['Never Gonna Give You Up', 'Second']);
    expect(first.playlists[0].tracks[0]).toMatchObject({ artists: 'Rick Astley', albumTitle: 'Whenever You Need Somebody', explicit: true });
    expect(fetcher.mock.calls.some(([url]) => url.includes('cursor=cursor%20one'))).toBe(true);
  });
  it('fails rather than silently truncating repeated server pages', async () => {
    const client = new AccountClient(storage()); client.session = session();
    vi.stubGlobal('fetch', vi.fn(async () => json({ items: [], nextCursor: 'same' }))); 
    await expect(client.pullLibrary()).rejects.toThrow('repetiu');
  });
  it('uploads only online liked snapshots with idempotent PUT and no local device URL', async () => {
    const client = new AccountClient(storage()); client.session = session();
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetcher);
    const track = fromCloudTrack(cloudTrack)!;
    const local = { ...track, id: 'local:file', source: 'local' as const, streamUrl: 'file:///private/music.mp3' };
    const result = await client.uploadLikes([track, track, local]);
    expect(result).toEqual({ uploaded: 1, skipped: 2 });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][0]).toBe('https://api.tryliner.fun/v1/me/library/tracks/dQw4w9WgXcQ');
    expect(fetcher.mock.calls[0][1].method).toBe('PUT');
    const payload = String(fetcher.mock.calls[0][1].body);
    expect(payload).not.toContain('file://');
    expect(JSON.parse(payload)).toMatchObject({ track: { id: track.id, artists: [{ id: '', name: 'Rick Astley' }] }, trackSnapshot: { id: track.id } });
    expect(toCloudTrack(local)).toBeNull();
  });
});


describe('profile lifetime', () => {
  it('never restores profile information from a request that finished after logout', async () => {
    const client = new AccountClient(storage()); client.session = session();
    let complete!: (response: Response) => void;
    const fetcher = vi.fn((url: string) => url.endsWith('/v1/me') ? new Promise<Response>(resolve => { complete = resolve; }) : Promise.resolve(json({})));
    vi.stubGlobal('fetch', fetcher);
    const profile = client.profile();
    const assertion = expect(profile).rejects.toThrow('conta mudou');
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    await client.logout();
    complete(json(session().user));
    await assertion;
    expect(client.session).toBeNull();
  });
});

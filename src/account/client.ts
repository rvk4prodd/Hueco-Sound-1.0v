import { ApiError, request, throwIfAborted } from '../api/transport';
import { DEFAULT_PRIMARY_API } from '../api/innertube';
import { array, at, object, string } from '../api/parsers';
import type { Playlist, Track } from '../types';

export interface AccountUser { id: string; email?: string; username?: string | null; displayName?: string | null; avatarUrl?: string | null; bio?: string | null; }
export interface AccountSession { accessToken: string; refreshToken: string; accessTokenExpiresAt: string; user: AccountUser; }
export interface SessionStorage { read: () => Promise<string | null>; write: (value: string | null) => Promise<void>; }
export class AccountError extends ApiError {
  constructor(message: string, status: number, public readonly backendCode = '') { super(message, 'http', status); this.name = 'AccountError'; }
}

function errorMessage(status: number, code: string): string {
  if (code === 'EMAIL_ALREADY_EXISTS' || code === 'EMAIL_TAKEN' || code === 'EMAIL_ALREADY_USED') return 'Este e-mail já possui uma conta.';
  if (code === 'USERNAME_TAKEN' || code === 'USERNAME_ALREADY_EXISTS') return 'Este nome de usuário já está em uso.';
  if (code === 'INVALID_USERNAME') return 'O usuário precisa ter de 3 a 30 letras, números ou _.';
  if (code === 'INVALID_INPUT') return 'Confira o nome de exibição e os demais campos.';
  if (code === 'INVALID_CREDENTIALS') return 'E-mail ou senha incorretos.';
  if (status === 401 || status === 403) return 'Sua sessão não foi autorizada. Entre novamente.';
  if (status === 429) return 'Muitas tentativas. Aguarde um pouco e tente novamente.';
  if (status >= 500) return 'O servidor está indisponível no momento. Tente novamente mais tarde.';
  if (status === 404) return 'Este recurso não foi encontrado.';
  if (status === 409) return 'Este e-mail ou nome de usuário já está em uso.';
  return 'O servidor não aceitou os dados. Confira os campos e tente novamente.';
}

export function validateCredentials(email: string, password: string, register?: { username: string; displayName: string; confirmation: string }): void {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) throw new Error('Digite um e-mail válido.');
  if (password.length < 8) throw new Error('A senha precisa ter pelo menos 8 caracteres.');
  if (!register) return;
  if (!/^[a-z0-9_]{3,30}$/.test(register.username.trim().toLowerCase())) throw new Error('O usuário precisa ter de 3 a 30 letras, números ou _.');
  if (!register.displayName.trim() || register.displayName.trim().length > 100) throw new Error('Digite um nome de exibição com até 100 caracteres.');
  if (password !== register.confirmation) throw new Error('As senhas não coincidem.');
}

function validUser(value: unknown): AccountUser | null {
  const data = object(value);
  if (!string(data.id)) return null;
  return { id: string(data.id), ...(typeof data.email === 'string' ? { email: data.email } : {}), ...(typeof data.username === 'string' ? { username: data.username } : {}), ...(typeof data.displayName === 'string' ? { displayName: data.displayName } : {}), ...(typeof data.avatarUrl === 'string' ? { avatarUrl: data.avatarUrl } : {}), ...(typeof data.bio === 'string' ? { bio: data.bio } : {}) };
}
export function parseSession(value: unknown, previous?: AccountSession): AccountSession {
  const data = object(value);
  const user = validUser(data.user) || previous?.user;
  if (!string(data.accessToken) || !string(data.refreshToken) || !string(data.accessTokenExpiresAt) || !Number.isFinite(Date.parse(string(data.accessTokenExpiresAt))) || !user) throw new ApiError('O servidor retornou uma sessão inválida.', 'invalid_response');
  return { accessToken: string(data.accessToken), refreshToken: string(data.refreshToken), accessTokenExpiresAt: string(data.accessTokenExpiresAt), user };
}

export function fromCloudTrack(value: unknown): Track | null {
  const data = object(value);
  const id = string(data.id);
  if (!id || id.startsWith('local:') || (!/^[a-zA-Z0-9_-]{11}$/.test(id.replace(/^yt:/, '')) && !/^sc:\d+$/.test(id))) return null;
  const artists = array(data.artists).map(artist => string(object(artist).name)).filter(Boolean).join(', ');
  if (!string(data.title) || !artists) return null;
  const cover = string(at(data, 'cover', 'url'));
  return { id, title: string(data.title), artists, coverUrl: /^https:\/\//.test(cover) ? cover : '', durationMs: Math.max(0, Number(data.durationMs) || 0), ...(string(at(data, 'album', 'title')) ? { albumTitle: string(at(data, 'album', 'title')) } : {}), ...(typeof data.explicit === 'boolean' ? { explicit: data.explicit } : {}), source: id.startsWith('sc:') ? 'soundcloud' : 'youtube' };
}
export function toCloudTrack(track: Track): Record<string, unknown> | null {
  if (track.source === 'local' || track.id.startsWith('local:') || !fromCloudTrack({ ...track, artists: [{ name: track.artists }] })) return null;
  return { id: track.id, title: track.title, artists: track.artists.split(/,\s*/).filter(Boolean).map(name => ({ id: '', name })), durationMs: track.durationMs, ...(track.coverUrl.startsWith('https://') ? { cover: { url: track.coverUrl, width: 0, height: 0 } } : {}), ...(track.albumTitle ? { album: { id: '', title: track.albumTitle } } : {}), ...(track.explicit !== undefined ? { explicit: track.explicit } : {}) };
}

export interface CloudLibrary { likedTracks: Track[]; playlists: Playlist[]; skippedTracks: number; }

export class AccountClient {
  session: AccountSession | null = null;
  private epoch = 0;
  private refreshPromise: Promise<AccountSession | null> | null = null;
  private writeChain: Promise<void> = Promise.resolve();
  private hydratePromise: Promise<void> | null = null;
  constructor(
    private readonly storage: SessionStorage,
    private readonly onChange: (session: AccountSession | null) => void = () => {},
    private readonly onStorageError: () => void = () => {},
    readonly baseUrl = DEFAULT_PRIMARY_API,
  ) {}

  private async send(path: string, init: RequestInit = {}, token?: string): Promise<unknown> {
    return request(`${this.baseUrl}${path}`, async response => {
      const data: unknown = response.status === 204 ? null : await response.json().catch(() => null);
      if (!response.ok) {
        const code = string(object(data).code);
        throw new AccountError(errorMessage(response.status, code), response.status, code);
      }
      return data;
    }, { ...init, timeoutMs: 12000, allowHttpErrors: true, headers: { ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), 'x-client-version': '1.1.0-mobile', 'x-platform': 'mobile', 'x-request-id': "req_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 10), ...init.headers } });
  }

  private async adopt(session: AccountSession | null): Promise<void> {
    this.session = session;
    this.onChange(session);
    const value = session ? JSON.stringify(session) : null;
    this.writeChain = this.writeChain.then(() => this.storage.write(value)).catch(() => { this.onStorageError(); });
    await this.writeChain;
  }

  hydrate(): Promise<void> {
    if (this.hydratePromise) return this.hydratePromise;
    const epoch = this.epoch;
    this.hydratePromise = (async () => {
      try {
        const raw = await this.storage.read();
        if (epoch !== this.epoch || !raw) return;
        try { this.session = parseSession(JSON.parse(raw)); this.onChange(this.session); }
        catch { await this.adopt(null); }
      } catch { this.onStorageError(); }
    })();
    return this.hydratePromise;
  }

  async login(email: string, password: string): Promise<void> {
    validateCredentials(email, password);
    const epoch = ++this.epoch;
    const data = await this.send('/v1/auth/login', { method: 'POST', body: JSON.stringify({ email: email.trim().toLowerCase(), password }) });
    if (epoch !== this.epoch) return;
    await this.adopt(parseSession(data));
  }
  async register(input: { email: string; password: string; username: string; displayName: string; confirmation: string }): Promise<void> {
    validateCredentials(input.email, input.password, input);
    const epoch = ++this.epoch;
    const data = await this.send('/v1/auth/register', { method: 'POST', body: JSON.stringify({ email: input.email.trim().toLowerCase(), password: input.password, username: input.username.trim().toLowerCase(), displayName: input.displayName.trim() }) });
    if (epoch !== this.epoch) return;
    await this.adopt(parseSession(data));
  }

  async refresh(): Promise<AccountSession | null> {
    if (this.refreshPromise) return this.refreshPromise;
    const current = this.session;
    if (!current) return null;
    const epoch = this.epoch;
    this.refreshPromise = (async () => {
      try {
        const data = await this.send('/v1/auth/refresh', { method: 'POST', body: JSON.stringify({ refreshToken: current.refreshToken }) });
        if (epoch !== this.epoch || this.session?.refreshToken !== current.refreshToken) return this.session;
        const session = parseSession(data, current);
        await this.adopt(session);
        return session;
      } catch (error) {
        if (error instanceof AccountError && ['INVALID_REFRESH_TOKEN', 'REFRESH_SESSION_EXPIRED'].includes(error.backendCode) && epoch === this.epoch) await this.adopt(null);
        throw error;
      } finally { this.refreshPromise = null; }
    })();
    return this.refreshPromise;
  }

  async getAccessToken(): Promise<string | null> {
    await this.hydrate();
    if (!this.session) return null;
    if (Date.parse(this.session.accessTokenExpiresAt) - Date.now() < 120000) await this.refresh();
    return this.session?.accessToken || null;
  }

  async authorized(path: string, init?: RequestInit): Promise<unknown> {
    const token = await this.getAccessToken();
    if (!token) throw new AccountError('Entre na sua conta para acessar a biblioteca da nuvem.', 401);
    if (this.session?.accessToken !== token) throw new Error('A conta mudou durante a solicitação. Tente novamente.');
    const epoch = this.epoch;
    try { return await this.send(path, init, token); }
    catch (error) {
      if (epoch !== this.epoch) throw new Error('A conta mudou durante a solicitação. Tente novamente.');
      if (!(error instanceof AccountError) || error.status !== 401) throw error;
      const next = this.session?.accessToken !== token ? this.session : await this.refresh();
      if (!next) throw error;
      return this.send(path, init, next.accessToken);
    }
  }

  async profile(): Promise<AccountUser> {
    const epoch = this.epoch;
    const user = validUser(await this.authorized('/v1/me'));
    if (epoch !== this.epoch || (user && this.session && user.id !== this.session.user.id)) throw new Error('A conta mudou durante a solicitação. Tente novamente.');
    if (!user || !this.session) throw new ApiError('O perfil da conta não está disponível.', 'invalid_response');
    await this.adopt({ ...this.session, user });
    return user;
  }

  async logout(): Promise<void> {
    ++this.epoch;
    const previous = this.session;
    await this.adopt(null);
    if (previous) await this.send('/v1/auth/logout', { method: 'POST', body: JSON.stringify({ refreshToken: previous.refreshToken }) }, previous.accessToken).catch(() => {});
  }

  async pullLibrary(signal?: AbortSignal, progress?: (message: string) => void): Promise<CloudLibrary> {
    await this.getAccessToken();
    const accountId = this.session?.user.id;
    if (!accountId) throw new AccountError('Entre na sua conta para importar a biblioteca.', 401);
    const likedTracks: Track[] = [];
    const seenCursors = new Set<string>();
    let cursor = '';
    let skippedTracks = 0;
    do {
      throwIfAborted(signal);
      progress?.(`Buscando curtidas: ${likedTracks.length}`);
      const page = object(await this.authorized(`/v1/me/library/tracks?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`, { signal }));
      if (!Array.isArray(page.items)) throw new ApiError('A lista de curtidas recebida é inválida.', 'invalid_response');
      for (const item of page.items) {
        const track = fromCloudTrack(object(item).track);
        if (track) likedTracks.push(track); else skippedTracks++;
      }
      cursor = string(page.nextCursor);
      if (cursor && seenCursors.has(cursor)) throw new ApiError('O servidor repetiu uma página de curtidas.', 'invalid_response');
      if (cursor) seenCursors.add(cursor);
      if (likedTracks.length > 20000 || seenCursors.size > 200) throw new Error('Sua biblioteca excede o limite de 20 mil curtidas por importação.');
    } while (cursor);
    const lists = object(await this.authorized('/v1/me/playlists', { signal }));
    if (!Array.isArray(lists.items)) throw new ApiError('A lista de playlists recebida é inválida.', 'invalid_response');
    if (lists.items.length > 500) throw new Error('Sua conta excede o limite de 500 playlists por importação.');
    const playlists: Playlist[] = [];
    for (const raw of lists.items) {
      throwIfAborted(signal);
      const summary = object(raw);
      const id = string(summary.id);
      if (!id) throw new ApiError('O servidor retornou uma playlist inválida.', 'invalid_response');
      progress?.(`Importando playlist ${playlists.length + 1} de ${lists.items.length}`);
      const details = object(await this.authorized(`/v1/me/playlists/${encodeURIComponent(id)}`, { signal }));
      const list = object(details.playlist);
      if (!Array.isArray(details.items) || !string(list.title)) throw new ApiError('O servidor retornou o conteúdo de uma playlist inválida.', 'invalid_response');
      if (details.items.length > 10000) throw new Error('Uma playlist excede o limite de 10 mil músicas por importação.');
      const tracks: Track[] = [];
      for (const item of [...details.items].sort((a, b) => Number(object(a).position || 0) - Number(object(b).position || 0))) {
        const track = fromCloudTrack(object(item).track);
        if (track) tracks.push(track); else skippedTracks++;
      }
      const createdAt = Date.parse(string(list.createdAt)) || Date.now();
      playlists.push({ id: `cloud:${accountId}:${id}`, name: string(list.title), ...(string(list.description) ? { description: string(list.description) } : {}), tracks: [...new Map(tracks.map(track => [track.id, track])).values()], createdAt, updatedAt: Date.parse(string(list.updatedAt)) || createdAt });
    }
    if (this.session?.user.id !== accountId) throw new Error('A conta mudou durante a importação. Tente novamente.');
    return { likedTracks: [...new Map(likedTracks.map(track => [track.id, track])).values()], playlists, skippedTracks };
  }

  /** Additive and explicit: never sends unlikes, deletes or device file paths. */
  async uploadLikes(tracks: Track[], progress?: (message: string) => void): Promise<{ uploaded: number; skipped: number }> {
    const epoch = this.epoch;
    const snapshots = [...new Map(tracks.map(track => [track.id, track])).values()].map(toCloudTrack).filter((track): track is Record<string, unknown> => !!track);
    let uploaded = 0;
    for (const track of snapshots) {
      if (epoch !== this.epoch) throw new Error('A conta mudou durante o envio. Tente novamente.');
      progress?.(`Enviando curtida ${uploaded + 1} de ${snapshots.length}`);
      await this.authorized(`/v1/me/library/tracks/${encodeURIComponent(string(track.id))}`, { method: 'PUT', body: JSON.stringify({ track, trackSnapshot: track }) });
      uploaded++;
    }
    return { uploaded, skipped: tracks.length - snapshots.length };
  }
}




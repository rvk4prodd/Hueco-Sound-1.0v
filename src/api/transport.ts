export type ApiErrorCode = 'network' | 'timeout' | 'http' | 'unavailable' | 'invalid_response' | 'configuration';

export class ApiError extends Error {
  constructor(message: string, public readonly code: ApiErrorCode, public readonly status?: number) {
    super(message);
    this.name = 'ApiError';
  }
}

export function abortError(): Error {
  const error = new Error('Operação cancelada.');
  error.name = 'AbortError';
  return error;
}

export function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw abortError();
}

export function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

interface RequestOptions extends RequestInit {
  timeoutMs?: number;
  retries?: number;
  allowHttpErrors?: boolean;
}

/** Deadline covers both headers and the response body. Retry only transient failures. */
export async function request<T>(
  url: string,
  read: (response: Response) => Promise<T>,
  options: RequestOptions = {},
): Promise<T> {
  const { timeoutMs = 10000, retries = 0, allowHttpErrors = false, signal, ...init } = options;
  for (let attempt = 0; ; attempt += 1) {
    throwIfAborted(signal ?? undefined);
    const controller = new AbortController();
    let timedOut = false;
    const cancel = () => controller.abort();
    signal?.addEventListener('abort', cancel, { once: true });
    let timer: ReturnType<typeof setTimeout> | undefined;
    // Racing makes cancellation/deadlines work even if a platform fetch ignores abort.
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
        reject(new ApiError('O servidor demorou para responder. Tente novamente.', 'timeout'));
      }, timeoutMs);
      controller.signal.addEventListener('abort', () => {
        if (!timedOut) reject(abortError());
      }, { once: true });
    });
    try {
      const operation = (async () => {
        const response = await fetch(url, { ...init, signal: controller.signal });
        if (!response.ok && !allowHttpErrors) {
          throw new ApiError(
            response.status === 429 ? 'Muitas solicitações. Aguarde um pouco e tente novamente.' :
              response.status === 401 || response.status === 403 ? 'O provedor não autorizou esta solicitação.' :
                `O servidor respondeu com erro (${response.status}).`,
            'http', response.status,
          );
        }
        try { return await read(response); }
        catch (error) {
          if (error instanceof ApiError || isAbortError(error)) throw error;
          throw new ApiError('O provedor enviou uma resposta inválida.', 'invalid_response');
        }
      })();
      const result = await Promise.race([operation, deadline]);
      throwIfAborted(signal ?? undefined);
      return result;
    } catch (error) {
      if (signal?.aborted) throw abortError();
      const failure = timedOut ? new ApiError('O servidor demorou para responder. Tente novamente.', 'timeout') :
        error instanceof ApiError ? error : new ApiError('Sem conexão com o provedor. Verifique a internet.', 'network');
      const transient = failure.code === 'network' || failure.code === 'timeout' ||
        (failure.code === 'http' && (failure.status === 502 || failure.status === 503 || failure.status === 504));
      if (!transient || attempt >= retries) throw failure;
    } finally {
      if (timer !== undefined) clearTimeout(timer);
      signal?.removeEventListener('abort', cancel);
    }
  }
}

export function requestJson(url: string, options?: RequestOptions): Promise<unknown> {
  return request(url, response => response.json(), options);
}

interface Pending<T> {
  promise: Promise<T>;
  controller: AbortController;
  subscribers: number;
}

/** Bounded memory cache with shared requests and independently cancellable subscribers. */
export class RequestCache<T> {
  private values = new Map<string, { value: T; expiresAt: number }>();
  private pending = new Map<string, Pending<T>>();

  constructor(private readonly capacity = 80) {}

  clear(): void {
    this.values.clear();
    for (const entry of this.pending.values()) entry.controller.abort();
    this.pending.clear();
  }

  delete(key: string): void { this.values.delete(key); }

  get(key: string, ttlMs: number | ((value: T) => number), factory: (signal: AbortSignal) => Promise<T>, signal?: AbortSignal): Promise<T> {
    try { throwIfAborted(signal); } catch (error) { return Promise.reject(error); }
    const cached = this.values.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      this.values.delete(key);
      this.values.set(key, cached);
      return Promise.resolve(cached.value);
    }
    this.values.delete(key);
    let entry = this.pending.get(key);
    if (!entry || entry.controller.signal.aborted) {
      const controller = new AbortController();
      const fresh: Pending<T> = { controller, subscribers: 0, promise: Promise.resolve(undefined as T) };
      fresh.promise = Promise.resolve().then(() => {
        throwIfAborted(controller.signal);
        return factory(controller.signal);
      }).then(value => {
        if (!controller.signal.aborted) {
          this.values.set(key, { value, expiresAt: Date.now() + Math.max(0, typeof ttlMs === 'function' ? ttlMs(value) : ttlMs) });
          while (this.values.size > this.capacity) this.values.delete(this.values.keys().next().value!);
        }
        return value;
      }).finally(() => {
        if (this.pending.get(key) === fresh) this.pending.delete(key);
      });
      entry = fresh;
      this.pending.set(key, fresh);
    }
    const shared = entry;
    shared.subscribers += 1;
    return new Promise<T>((resolve, reject) => {
      let done = false;
      const finish = (callback: () => void) => {
        if (done) return;
        done = true;
        signal?.removeEventListener('abort', cancel);
        shared.subscribers -= 1;
        if (shared.subscribers === 0) shared.controller.abort();
        callback();
      };
      const cancel = () => finish(() => reject(abortError()));
      signal?.addEventListener('abort', cancel, { once: true });
      shared.promise.then(value => finish(() => resolve(value)), error => finish(() => reject(error)));
      if (signal?.aborted) cancel();
    });
  }
}

/** Caps a whole multi-provider operation, including optional session providers. */
export async function withDeadline<T>(factory: (signal: AbortSignal) => Promise<T>, signal: AbortSignal, timeoutMs: number): Promise<T> {
  throwIfAborted(signal);
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let timedOut = false;
  const cancel = () => controller.abort();
  signal.addEventListener('abort', cancel, { once: true });
  const deadline = new Promise<never>((_, reject) => {
    controller.signal.addEventListener('abort', () => reject(timedOut ?
      new ApiError('O provedor demorou para disponibilizar o áudio. Tente novamente.', 'timeout') : abortError()), { once: true });
    timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  });
  try { return await Promise.race([Promise.resolve().then(() => factory(controller.signal)), deadline]); }
  finally {
    if (timer !== undefined) clearTimeout(timer);
    signal.removeEventListener('abort', cancel);
  }
}


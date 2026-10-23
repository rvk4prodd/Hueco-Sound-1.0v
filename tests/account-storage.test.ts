import { secureSessionStorage } from '../src/account/storage';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const native = vi.hoisted(() => ({ platform: { OS: 'web' }, available: vi.fn(async () => true), read: vi.fn(async () => 'encrypted-session'), write: vi.fn(async () => {}), remove: vi.fn(async () => {}) }));
vi.mock('react-native', () => ({ Platform: native.platform }));
vi.mock('expo-secure-store', () => ({ isAvailableAsync: native.available, getItemAsync: native.read, setItemAsync: native.write, deleteItemAsync: native.remove, AFTER_FIRST_UNLOCK: 0 }));

beforeEach(() => { vi.clearAllMocks(); native.platform.OS = 'web'; native.available.mockResolvedValue(true); });
describe('session storage boundaries', () => {
  it('keeps browser tokens in memory and never writes browser persistence', async () => {
    await expect(secureSessionStorage.read()).resolves.toBeNull();
    await secureSessionStorage.write('secret');
    expect(native.write).not.toHaveBeenCalled();
    expect(native.read).not.toHaveBeenCalled();
    expect(native.available).not.toHaveBeenCalled();
  });
  it('uses only SecureStore on native and removes the stored session on logout', async () => {
    native.platform.OS = 'android';
    await expect(secureSessionStorage.read()).resolves.toBe('encrypted-session');
    await secureSessionStorage.write('session');
    expect(native.write).toHaveBeenCalledWith('liner.account.session.v1', 'session', { keychainAccessible: 0 });
    await secureSessionStorage.write(null);
    expect(native.remove).toHaveBeenCalledWith('liner.account.session.v1');
  });
  it('fails visibly when encrypted storage is unavailable', async () => {
    native.platform.OS = 'android'; native.available.mockResolvedValue(false);
    await expect(secureSessionStorage.write('session')).rejects.toThrow('seguro indisponível');
    expect(native.write).not.toHaveBeenCalled();
  });
});


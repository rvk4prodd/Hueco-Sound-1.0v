import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import type { SessionStorage } from './client';

const KEY = 'liner.account.session.v1';
/** Browser sessions are deliberately memory-only. Native sessions use OS encryption. */
export const secureSessionStorage: SessionStorage = {
  async read() {
    if (Platform.OS === 'web') return null;
    if (!(await SecureStore.isAvailableAsync())) throw new Error('Armazenamento seguro indisponível.');
    return SecureStore.getItemAsync(KEY);
  },
  async write(value) {
    if (Platform.OS === 'web') return;
    if (!(await SecureStore.isAvailableAsync())) throw new Error('Armazenamento seguro indisponível.');
    if (value === null) await SecureStore.deleteItemAsync(KEY);
    else await SecureStore.setItemAsync(KEY, value, { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK });
  },
};

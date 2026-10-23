import { create } from 'zustand';
import { AccountClient, AccountSession } from './client';
import { secureSessionStorage } from './storage';
import { configureApi } from '../api/innertube';
import { usePlayerStore } from '../player/usePlayerStore';
import { isAbortError } from '../api/transport';

interface AccountState {
  session: AccountSession | null;
  initialized: boolean;
  busy: 'auth' | 'pull' | 'upload' | 'logout' | null;
  progress: string;
  error: string | null;
  info: string | null;
  storageWarning: boolean;
  initialize: () => Promise<void>;
  login: (email: string, password: string) => Promise<boolean>;
  register: (input: { email: string; password: string; confirmation: string; username: string; displayName: string }) => Promise<boolean>;
  logout: () => Promise<void>;
  pullLibrary: () => Promise<void>;
  uploadLikes: () => Promise<void>;
  cancelSync: () => void;
  clearMessages: () => void;
}
let initializePromise: Promise<void> | null = null;
let syncController: AbortController | null = null;
const message = (error: unknown) => error instanceof Error ? error.message : 'Não foi possível concluir. Tente novamente.';

export const useAccountStore = create<AccountState>((set, get) => {
  const progress = (value: string) => set({ progress: value });
  return {
    session: null, initialized: false, busy: null, progress: '', error: null, info: null, storageWarning: false,
    initialize: () => {
      if (initializePromise) return initializePromise;
      initializePromise = (async () => {
        await accountClient.hydrate();
        if (accountClient.session) {
          try { await accountClient.profile(); } catch (error) { set({ error: message(error) }); }
        }
        set({ initialized: true });
      })();
      return initializePromise;
    },
    login: async (email, password) => {
      if (get().busy) return false;
      set({ busy: 'auth', error: null, info: null });
      try { await accountClient.login(email, password); set({ initialized: true }); return true; }
      catch (error) { set({ error: message(error) }); return false; }
      finally { set({ busy: null }); }
    },
    register: async input => {
      if (get().busy) return false;
      set({ busy: 'auth', error: null, info: null });
      try { await accountClient.register(input); set({ initialized: true }); return true; }
      catch (error) { set({ error: message(error) }); return false; }
      finally { set({ busy: null }); }
    },
    logout: async () => {
      if (get().busy) return;
      set({ busy: 'logout', error: null, info: null });
      try { await accountClient.logout(); }
      catch (error) { set({ error: message(error) }); }
      finally { set({ busy: null }); }
    },
    pullLibrary: async () => {
      if (get().busy) return;
      set({ busy: 'pull', progress: 'Conectando à biblioteca...', error: null, info: null });
      syncController = new AbortController();
      try {
        await usePlayerStore.getState().loadSavedData();
        const library = await accountClient.pullLibrary(syncController.signal, progress);
        usePlayerStore.getState().importLibraryData(library);
        set({ info: `${library.likedTracks.length} curtidas e ${library.playlists.length} playlists importadas.${library.skippedTracks ? ` ${library.skippedTracks} músicas sem suporte foram ignoradas.` : ''}` });
      } catch (error) { set(isAbortError(error) ? { info: 'Importação cancelada.' } : { error: message(error) }); }
      finally { syncController = null; set({ busy: null, progress: '' }); }
    },
    uploadLikes: async () => {
      if (get().busy) return;
      set({ busy: 'upload', progress: 'Enviando curtidas...', error: null, info: null });
      try {
        await usePlayerStore.getState().loadSavedData();
        const result = await accountClient.uploadLikes(usePlayerStore.getState().likedTracks, progress);
        set({ info: `${result.uploaded} curtidas enviadas para sua conta.${result.skipped ? ` ${result.skipped} arquivos ou itens sem suporte ficaram apenas neste aparelho.` : ''}` });
      } catch (error) { set({ error: `${message(error)} Algumas curtidas anteriores podem ter sido enviadas; você pode repetir sem duplicá-las.` }); }
      finally { set({ busy: null, progress: '' }); }
    },
    cancelSync: () => syncController?.abort(),
    clearMessages: () => set({ error: null, info: null }),
  };
});

export const accountClient = new AccountClient(secureSessionStorage,
  session => useAccountStore.setState({ session }),
  () => useAccountStore.setState({ storageWarning: true }));
// Authenticated desktop audio cache is optional; anonymous playback still works.
configureApi({ getAccessToken: () => accountClient.getAccessToken() });

export function initializeAccount(): Promise<void> { return useAccountStore.getState().initialize(); }

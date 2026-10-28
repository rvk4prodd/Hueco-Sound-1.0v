import React, { useMemo, useState, useSyncExternalStore } from 'react';
import Constants from 'expo-constants';
import { FlatList, Pressable, Share, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { addLog, clearLogs, getLogs, serializeLogs, subscribeLogs, type LogLevel } from '../diagnostics/logs';
import { audioManager } from '../player/audioManager';
import { clearPlaybackTrace } from '../player/playbackTrace';
import { colors, themedStyles, useHuecoTheme } from '../theme';
import { Chip, ConfirmDialog, IconButton, screenStyles as base } from './ScreenParts';
import { useUIStore } from '../ui/useUIStore';

export default function LogsScreen() {
  useHuecoTheme();
  const entries = useSyncExternalStore(subscribeLogs, getLogs, getLogs);
  const [filter, setFilter] = useState<LogLevel | 'all'>('all');
  const [query, setQuery] = useState(''), [confirm, setConfirm] = useState(false);
  const notify = useUIStore(state => state.notify);
  const visible = useMemo(() => entries.filter(e => (filter === 'all' || e.level === filter) && `${e.scope} ${e.message}`.toLowerCase().includes(query.toLowerCase())).slice().reverse(), [entries, filter, query]);
  const share = async () => { try { await Share.share({ title: 'Logs · Hueco Sound', message: serializeLogs(Constants.expoConfig?.version) }); } catch { notify('Não foi possível compartilhar os logs.'); } };
  return <View style={base.screen}>
    <View style={base.header}><IconButton name="arrow-back" label="Voltar" onPress={() => router.canGoBack() ? router.back() : router.replace('/settings')} /><Text style={base.title}>Logs</Text><Text style={s.muted}>{entries.length}/300</Text></View>
    <View style={s.tools}>
      <Text style={s.muted}>Registros locais em tempo real. Endereços, credenciais e emails são ocultados. Nenhum envio automático.</Text>
      <View style={s.row}>{(['all', 'error', 'warn', 'info'] as const).map(level => <Chip key={level} label={{ all: 'Todos', error: 'Erros', warn: 'Avisos', info: 'Info' }[level]} active={filter === level} onPress={() => setFilter(level)} />)}</View>
      <TextInput value={query} onChangeText={setQuery} placeholder="Buscar nos logs" placeholderTextColor={colors.muted} accessibilityLabel="Buscar nos logs" style={s.input} autoCapitalize="none" />
      <View style={s.row}><Pressable accessibilityRole="button" style={s.button} onPress={() => void share()}><Text style={s.label}>Compartilhar</Text></Pressable><Pressable accessibilityRole="button" style={s.button} onPress={() => addLog('info', 'diagnóstico', audioManager.diagnostics())}><Text style={s.label}>Estado do player</Text></Pressable><Pressable accessibilityRole="button" style={s.button} onPress={() => setConfirm(true)}><Text style={s.label}>Limpar</Text></Pressable></View>
    </View>
    <FlatList data={visible} keyExtractor={entry => String(entry.id)} contentContainerStyle={s.list} keyboardShouldPersistTaps="handled" initialNumToRender={15}
      ListEmptyComponent={<Text style={s.muted}>Nenhum registro para este filtro. Reproduza uma música para acompanhar os eventos.</Text>}
      renderItem={({ item }) => <View style={s.entry}><Text style={[s.meta, item.level === 'error' && { color: '#ff8a96' }, item.level === 'warn' && { color: '#f3c777' }]}>{new Date(item.at).toLocaleTimeString()} · {item.level.toUpperCase()} · {item.scope}</Text><Text selectable style={s.message}>{item.message}</Text></View>} />
    <ConfirmDialog visible={confirm} title="Limpar logs?" description="Apaga os registros de diagnóstico deste aparelho." confirmLabel="Limpar" onClose={() => setConfirm(false)} onConfirm={() => { clearPlaybackTrace(); clearLogs(); setConfirm(false); }} />
  </View>;
}
const s = themedStyles(() => ({
  tools: { paddingHorizontal: 20, gap: 12, paddingBottom: 14 }, row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  muted: { color: colors.muted, fontSize: 12, lineHeight: 18 }, input: { color: colors.text, backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 12 },
  button: { borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12 }, label: { color: colors.text, fontSize: 12, fontWeight: '600' },
  list: { paddingHorizontal: 20, paddingBottom: 120 }, entry: { borderBottomWidth: 1, borderBottomColor: colors.border, paddingVertical: 12, gap: 6 },
  meta: { color: colors.accent, fontSize: 11 }, message: { color: colors.text, fontSize: 12, lineHeight: 18 },
}));

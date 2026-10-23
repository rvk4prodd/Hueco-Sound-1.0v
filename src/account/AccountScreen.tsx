import React, { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useAccountStore } from './useAccountStore';
import { colors } from '../theme';
import { ActionButton, Chip, Cover, IconButton } from '../screens/ScreenParts';

export function AccountScreen() {
  const session = useAccountStore(s => s.session);
  const busy = useAccountStore(s => s.busy);
  const progress = useAccountStore(s => s.progress);
  const error = useAccountStore(s => s.error);
  const info = useAccountStore(s => s.info);
  const warning = useAccountStore(s => s.storageWarning);
  const initialized = useAccountStore(s => s.initialized);
  const [registering, setRegistering] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  useEffect(() => { void useAccountStore.getState().initialize(); }, []);
  const authenticate = async () => {
    const store = useAccountStore.getState();
    const success = registering ? await store.register({ email, password, confirmation, username, displayName }) : await store.login(email, password);
    if (success) { setPassword(''); setConfirmation(''); }
  };
  const field = (label: string, value: string, change: (value: string) => void, secure = false) => <View style={s.field}><Text style={s.label}>{label}</Text><TextInput accessibilityLabel={label} editable={!busy} value={value} onChangeText={change} secureTextEntry={secure && !showPassword} autoCapitalize="none" autoCorrect={false} keyboardType={label === 'E-mail' ? 'email-address' : 'default'} autoComplete={label === 'E-mail' ? 'email' : secure ? registering ? 'new-password' : 'current-password' : 'off'} maxLength={secure ? 256 : label === 'Usuário' ? 30 : 150} style={s.input} placeholderTextColor={colors.muted} onSubmitEditing={() => { if (label === 'Senha' && !registering) void authenticate(); }} /></View>;
  return <KeyboardAvoidingView style={s.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <View style={s.header}><IconButton name="arrow-back" label="Voltar" onPress={() => router.back()} /><Text style={s.title}>Sua conta Liner</Text></View>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.content}>
      {!initialized && <ActivityIndicator color={colors.accent} />}
      {warning && <Text style={s.warning}>Não foi possível atualizar o armazenamento seguro. Sua sessão funciona nesta abertura, mas pode não ser restaurada ou removida após reiniciar o aplicativo.</Text>}
      {error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
      {info && <Text accessibilityLiveRegion="polite" style={s.info}>{info}</Text>}
      {session ? <>
        <View style={s.profile}><Cover uri={session.user.avatarUrl || undefined} size={76} round icon="person" /><View style={{ flex: 1 }}><Text style={s.name}>{session.user.displayName || session.user.username || 'Sua conta'}</Text>{session.user.username && <Text style={s.muted}>@{session.user.username}</Text>}{session.user.email && <Text style={s.muted}>{session.user.email}</Text>}</View></View>
        <View style={s.card}><Ionicons name="cloud-download-outline" size={30} color={colors.accent} /><Text style={s.cardTitle}>Traga sua biblioteca do PC</Text><Text style={s.body}>Importe as músicas curtidas e playlists da sua conta. Os itens deste celular são mantidos e músicas repetidas são agrupadas.</Text><ActionButton icon="cloud-download-outline" label="Importar da minha conta" disabled={!!busy} onPress={() => { void useAccountStore.getState().pullLibrary(); }} /></View>
        <View style={s.card}><Text style={s.cardTitle}>Curtidas na nuvem</Text><Text style={s.body}>Envie as curtidas online deste celular para sua conta. Esse envio adiciona curtidas e mantém as que já existem na nuvem. Arquivos locais ficam neste aparelho.</Text><ActionButton secondary icon="cloud-upload-outline" label="Enviar minhas curtidas" disabled={!!busy} onPress={() => { void useAccountStore.getState().uploadLikes(); }} /></View>
        <Text style={s.body}>A importação e o envio acontecem quando você toca nos botões. Playlists criadas neste celular continuam locais; use o backup para transferi-las.</Text>
        <ActionButton secondary icon="log-out-outline" label={busy === 'logout' ? 'Saindo...' : 'Sair da conta'} disabled={!!busy} onPress={() => { void useAccountStore.getState().logout(); }} />
      </> : <>
        <View style={s.hero}><View style={s.heroIcon}><Ionicons name="person-circle-outline" size={58} color={colors.accent} /></View><Text style={s.name}>Sua música, com você.</Text><Text style={[s.body, { textAlign: 'center' }]}>Entre na mesma conta usada no Liner do PC para trazer sua biblioteca.</Text></View>
        <View style={s.tabs}><Chip label="Entrar" active={!registering} onPress={() => { if (!busy) { setRegistering(false); useAccountStore.getState().clearMessages(); } }} /><Chip label="Criar conta" active={registering} onPress={() => { if (!busy) { setRegistering(true); useAccountStore.getState().clearMessages(); } }} /></View>
        {field('E-mail', email, setEmail)}
        {registering && <>{field('Nome de exibição', displayName, setDisplayName)}{field('Usuário', username, setUsername)}</>}
        <View>{field('Senha', password, setPassword, true)}<View style={s.show}><IconButton name={showPassword ? 'eye-off-outline' : 'eye-outline'} label={showPassword ? 'Ocultar senha' : 'Mostrar senha'} onPress={() => setShowPassword(!showPassword)} /></View></View>
        {registering && field('Confirmar senha', confirmation, setConfirmation, true)}
        <ActionButton label={busy === 'auth' ? 'Conectando...' : registering ? 'Criar minha conta' : 'Entrar na conta'} disabled={!!busy || !initialized || !email.trim() || !password} onPress={() => { void authenticate(); }} />
        <Text style={s.body}>Você também pode continuar usando o Hueco Sound sem entrar. A conexão com a conta Liner é opcional. No navegador, a sessão dura apenas enquanto o aplicativo estiver aberto.</Text>
      </>}
      {busy && <View accessibilityLiveRegion="polite" style={s.progress}><ActivityIndicator color={colors.accent} /><Text style={s.muted}>{progress || 'Aguarde...'}</Text>{busy === 'pull' && <ActionButton secondary label="Cancelar" onPress={() => useAccountStore.getState().cancelSync()} />}</View>}
    </ScrollView>
  </KeyboardAvoidingView>;
}
export default AccountScreen;

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background }, header: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 14 }, title: { color: colors.text, fontSize: 23, fontWeight: '800' }, content: { padding: 22, gap: 20, paddingBottom: 50, width: '100%', maxWidth: 600, alignSelf: 'center' },
  hero: { alignItems: 'center', gap: 14, paddingVertical: 14 }, heroIcon: { width: 96, height: 96, borderRadius: 48, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' }, name: { fontSize: 23, fontWeight: '800', color: colors.text }, muted: { color: colors.muted, fontSize: 14, lineHeight: 21 }, body: { color: colors.muted, fontSize: 15, lineHeight: 23 }, tabs: { flexDirection: 'row', gap: 9 }, field: { gap: 8 }, label: { color: colors.text, fontSize: 14, fontWeight: '600' }, input: { minHeight: 52, paddingHorizontal: 15, paddingRight: 50, borderRadius: 12, color: colors.text, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, fontSize: 16 }, show: { position: 'absolute', right: 4, bottom: 4 }, card: { backgroundColor: colors.surface, borderRadius: 18, padding: 20, gap: 16 }, cardTitle: { color: colors.text, fontSize: 20, fontWeight: '700' }, profile: { flexDirection: 'row', gap: 16, alignItems: 'center', paddingVertical: 12 }, error: { backgroundColor: '#3d2525', color: colors.danger, padding: 15, borderRadius: 12, lineHeight: 22 }, info: { backgroundColor: '#243521', color: colors.accent, padding: 15, borderRadius: 12, lineHeight: 22 }, warning: { color: '#e9c780', fontSize: 14, lineHeight: 21 }, progress: { gap: 14, alignItems: 'center', padding: 20 },
});


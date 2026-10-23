import React, { useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { HuecoLogo, CharacterSprite } from '../components/HuecoBrand';
import { GlassCard } from '../components/GlassCard';
import { Chip, IconButton, screenStyles as base } from './ScreenParts';
import { linerLicense, expoLicense } from '../legal/notices';
import { dependencyNotices } from '../legal/dependencies';
import { colors } from '../theme';
import { useUIStore } from '../ui/useUIStore';

const tabs = ['Sobre', 'Termos', 'Privacidade', 'Licenças'] as const;
type Tab = typeof tabs[number];
const terms = [
  ['Uso do aplicativo', 'Hueco Sound é uma adaptação pessoal de um reprodutor musical, baseada no projeto Liner. Use somente conteúdos aos quais você tenha acesso autorizado. A disponibilidade das músicas depende dos respectivos provedores.'],
  ['Projeto de origem', 'Liner Project Contributors & feralbureau são creditados pelo projeto original. A licença fornecida com a source é “Liner Source-Available & Non-Commercial Contribution License”, versão 1.0 (2026). Ela permite uso e modificações pessoais e não comerciais, com restrições à redistribuição pública e a versões derivadas com outra marca. Créditos não substituem autorização dos titulares. Consulte o texto integral em Licenças.'],
  ['Conteúdo e identidade visual', 'Músicas, capas, letras, nomes, marcas e personagens pertencem aos seus respectivos titulares. A identidade e as artes do Hueco Sound foram fornecidas para esta adaptação. A inclusão desses materiais não transfere direitos nem representa vínculo oficial com seus titulares.'],
  ['Armazenamento e disponibilidade', 'Playlists e preferências ficam no aparelho. Downloads offline são explícitos; o cache temporário de reprodução pode ser removido pelo sistema. Você pode exportar sua biblioteca nas configurações. Serviços externos, rede e sistema podem interromper a reprodução.'],
];
const privacy = [
  ['Dados no aparelho', 'Preferências, curtidas, fila, histórico e playlists são salvos localmente. Áudios importados e downloads ficam no armazenamento do aplicativo. A desinstalação pode apagar esses dados. Faça backup antes de trocar de aparelho.'],
  ['Serviços externos', 'Buscas e pedidos de áudio são enviados ao YouTube/YouTube Music; uma alternativa de áudio pode consultar o SoundCloud. Título e artista podem ser enviados ao LRCLIB para buscar letras. As solicitações revelam aos provedores dados comuns de conexão, como o endereço IP. Capas são carregadas dos servidores indicados por esses serviços.'],
  ['Conta opcional', 'Ao entrar com uma conta Liner, credenciais são enviadas ao servidor Liner configurado. Tokens da sessão usam o armazenamento seguro do aparelho. Importar biblioteca e enviar curtidas são ações explícitas. O Hueco Sound não possui um servidor próprio de contas.'],
  ['Permissões e diagnóstico', 'O aplicativo não solicita gravação de microfone. O serviço de mídia do Android mantém a reprodução e seus controles. Arquivos são escolhidos pelo seletor do sistema. O diagnóstico só é compartilhado quando você usa a opção nas configurações. Não inclui senhas ou endereços assinados de áudio.'],
];
export function AboutScreen() {
  const [tab, setTab] = useState<Tab>('Sobre');
  const [openLicense, setOpenLicense] = useState<string | null>(null);
  return <View style={base.screen}><ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
    <View style={base.header}><IconButton name="arrow-back" label="Voltar" onPress={() => router.canGoBack() ? router.back() : router.replace('/settings')} /><Text style={[base.title, { fontSize: 25 }]}>Sobre o Hueco Sound</Text></View>
    <View style={s.brand}><HuecoLogo width={280} /><Text style={s.version}>1.2.0 · 23 de outubro de 2026</Text></View>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={base.chips}>{tabs.map(value => <Chip key={value} label={value} active={tab === value} onPress={() => setTab(value)} />)}</ScrollView>
    {tab === 'Sobre' ? <><GlassCard style={s.card}><View style={{ alignItems: 'center' }}><CharacterSprite size={145} variant={2} /></View><Text style={s.title}>Seu som, seu mundo.</Text><Text style={s.text}>Identidade e direção do projeto</Text><Text style={s.credit}>ZhyrSnow</Text><Text style={s.text}>Adaptação pessoal para Android baseada no Liner. Nosso agradecimento a Liner Project Contributors & feralbureau pelo projeto de origem e a quem mantém as bibliotecas utilizadas.</Text><Pressable accessibilityRole="link" onPress={() => { void Linking.openURL('https://github.com/tryliner/desktop').catch(() => useUIStore.getState().notify('Não foi possível abrir o projeto de origem.')); }}><Text style={s.link}>Conhecer o projeto Liner ↗</Text></Pressable></GlassCard><View style={s.card}><Text style={s.text}>Construído com Expo, React Native, Expo Router, expo-audio e Zustand. Os avisos de licença do projeto de origem e do template Expo estão preservados na aba Licenças.</Text></View></> : tab === 'Licenças' ? <View style={s.card}><Text style={s.title}>Liner · licença original</Text><Text selectable style={s.license}>{linerLicense}</Text><Text style={s.title}>Template Expo · MIT</Text><Text selectable style={s.license}>{expoLicense}</Text><Text style={s.title}>Bibliotecas do aplicativo</Text>{dependencyNotices.map(notice => <View key={notice.name}><Pressable accessibilityRole="button" accessibilityState={{ expanded: openLicense === notice.name }} onPress={() => setOpenLicense(openLicense === notice.name ? null : notice.name)}><Text style={s.link}>{notice.name} · {notice.version} {openLicense === notice.name ? '−' : '+'}</Text></Pressable>{openLicense === notice.name && <Text selectable style={s.license}>{notice.text || notice.license}</Text>}</View>)}</View> : <View style={s.card}>{(tab === 'Termos' ? terms : privacy).map(([title, body]) => <View key={title} style={{ marginBottom: 25 }}><Text style={s.title}>{title}</Text><Text selectable style={s.text}>{body}</Text></View>)}</View>}
  </ScrollView></View>;
}
const s = StyleSheet.create({ brand: { alignItems: 'center', paddingVertical: 20, gap: 12 }, version: { color: colors.muted, fontSize: 12 }, card: { marginHorizontal: 20, padding: 22, gap: 15, marginTop: 12 }, title: { color: colors.text, fontWeight: '800', fontSize: 20, marginBottom: 10 }, text: { color: colors.muted, fontSize: 14, lineHeight: 23 }, credit: { color: colors.accent, fontSize: 29, fontWeight: '900', letterSpacing: -.7 }, link: { color: colors.accent, paddingVertical: 15, fontWeight: '700' }, license: { color: colors.muted, fontSize: 12, lineHeight: 20, marginBottom: 30 } });

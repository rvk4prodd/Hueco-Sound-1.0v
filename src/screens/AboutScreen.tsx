import React, { useState } from 'react';
import Constants from 'expo-constants';
import { ScrollView, StyleSheet, Text, View, Pressable } from 'react-native';
import { router } from 'expo-router';
import { HuecoLogo, CharacterSprite } from '../components/HuecoBrand';
import { GlassCard } from '../components/GlassCard';
import { Chip, IconButton, screenStyles as base } from './ScreenParts';
import { huecoSoundLicense, expoLicense, originalProjectLicense } from '../legal/notices';
import { dependencyNotices } from '../legal/dependencies';
import { colors } from '../theme';

const tabs = ['Sobre', 'Termos', 'Privacidade', 'Licenças'] as const;
type Tab = typeof tabs[number];

const terms = [
  ['Uso do aplicativo', 'Hueco Sound é um reprodutor e mixer musical desenvolvido para oferecer a melhor experiência sonora no seu dispositivo. Use somente conteúdos aos quais você tenha acesso autorizado. A disponibilidade das faixas online depende dos respectivos provedores.'],
  ['Conteúdo e identidade visual', 'A marca Hueco Sound, sua identidade visual e arte gráfica pertencem a ZhyrSnow. Músicas, capas e metadados pertencem aos seus respectivos autores e gravadoras.'],
  ['Armazenamento e disponibilidade', 'Playlists, preferências e histórico ficam salvos localmente no seu aparelho. Downloads offline são explícitos e protegidos. Você pode exportar e restaurar sua biblioteca a qualquer momento pelas configurações.'],
];

const privacy = [
  ['Dados no aparelho', 'Preferências, curtidas, fila, histórico e playlists são salvos estritamente no armazenamento local do seu dispositivo. Nenhum dado de conta ou credencial é enviado a servidores de terceiros.'],
  ['Serviços de áudio', 'Buscas e streams são consultados diretamente nos provedores de áudio suportados. Título e artista podem ser consultados no serviço LRCLIB para exibir letras sincronizadas.'],
  ['Permissões do sistema', 'O aplicativo utiliza o serviço de mídia em primeiro plano do Android (MediaSession) para notificações, suporte a fones Bluetooth e controles na tela de bloqueio do Samsung One UI. O aplicativo não grava áudio nem acessa microfone.'],
];

export function AboutScreen() {
  const [tab, setTab] = useState<Tab>('Sobre');
  const [openLicense, setOpenLicense] = useState<string | null>(null);

  return (
    <View style={base.screen}>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={base.header}>
          <IconButton name="arrow-back" label="Voltar" onPress={() => router.canGoBack() ? router.back() : router.replace('/settings')} />
          <Text style={[base.title, { fontSize: 24 }]}>Sobre o Hueco Sound</Text>
        </View>

        <View style={s.brand}>
          <HuecoLogo width={280} />
          <Text style={s.version}>Versão {Constants.expoConfig?.version ?? '—'} · Android</Text>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={base.chips}>
          {tabs.map(value => (
            <Chip key={value} label={value} active={tab === value} onPress={() => setTab(value)} />
          ))}
        </ScrollView>

        {tab === 'Sobre' ? (
          <>
            <GlassCard style={s.card}>
              <View style={{ alignItems: 'center' }}>
                <CharacterSprite size={145} variant={2} />
              </View>
              <Text style={s.title}>Seu som, seu mundo.</Text>
              <Text style={s.text}>Identidade, criação e direção do projeto</Text>
              <Text style={s.credit}>ZhyrSnow</Text>
              <Text style={s.text}>
                Hueco Sound traz reprodução de altíssima qualidade, transições suaves de DJ e mixagem personalizada entre faixas.
              </Text>
            </GlassCard>

            <View style={s.card}>
              <Text style={s.text}>
                Construído com Expo, React Native, Expo Router, expo-audio e Zustand.
              </Text>
            </View>
          </>
        ) : tab === 'Licenças' ? (
          <View style={s.card}>
            <Text style={s.title}>Hueco Sound · Licença</Text>
            <Text selectable style={s.license}>{huecoSoundLicense}</Text>
            <Text style={s.title}>Projeto de origem · créditos e licença</Text><Text selectable style={s.license}>{originalProjectLicense}</Text>
            <Text style={s.title}>Template Expo · MIT</Text>
            <Text selectable style={s.license}>{expoLicense}</Text>
            <Text style={s.title}>Bibliotecas do aplicativo</Text>
            {dependencyNotices.map(notice => (
              <View key={notice.name}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ expanded: openLicense === notice.name }}
                  onPress={() => setOpenLicense(openLicense === notice.name ? null : notice.name)}
                >
                  <Text style={s.link}>{notice.name} · {notice.version} {openLicense === notice.name ? '−' : '+'}</Text>
                </Pressable>
                {openLicense === notice.name && <Text selectable style={s.license}>{notice.text || notice.license}</Text>}
              </View>
            ))}
          </View>
        ) : (
          <View style={s.card}>
            {(tab === 'Termos' ? terms : privacy).map(([title, body]) => (
              <View key={title} style={{ marginBottom: 25 }}>
                <Text style={s.title}>{title}</Text>
                <Text selectable style={s.text}>{body}</Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  brand: { alignItems: 'center', paddingVertical: 20, gap: 12 },
  version: { color: colors.muted, fontSize: 13, fontWeight: '600' },
  card: { marginHorizontal: 20, padding: 22, gap: 15, marginTop: 12 },
  title: { color: colors.text, fontWeight: '800', fontSize: 20, marginBottom: 10 },
  text: { color: colors.muted, fontSize: 14, lineHeight: 23 },
  credit: { color: colors.accent, fontSize: 29, fontWeight: '900', letterSpacing: -0.7 },
  link: { color: colors.accent, paddingVertical: 12, fontWeight: '700' },
  license: { color: colors.muted, fontSize: 12, lineHeight: 20, marginBottom: 24 },
});

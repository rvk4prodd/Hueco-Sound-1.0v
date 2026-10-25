import Constants from 'expo-constants';
import React, { useEffect, useState } from 'react';
import { Pressable, Share, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { usePlayerStore } from '../player/usePlayerStore';
import { useUIStore } from '../ui/useUIStore';
import { exportLibrary, importLibrary, importLocalTracks } from '../library/transfers';
import { colors } from '../theme';
import { Chip, ConfirmDialog, IconButton, screenStyles as base } from './ScreenParts';
import { useExperienceStore } from '../preferences/experience';
import { GlassCard } from '../components/GlassCard';
import { HuecoLogo } from '../components/HuecoBrand';

function Section({ title, children }: { title: string; children: React.ReactNode }) { return <View style={s.section}><Text style={s.sectionTitle}>{title}</Text><GlassCard style={s.card}>{children}</GlassCard></View>; }
function Option({ title, description, icon, onPress, disabled }: { title: string; description: string; icon: React.ComponentProps<typeof Ionicons>['name']; onPress: () => void; disabled?: boolean }) {
  return <Pressable disabled={disabled} accessibilityRole="button" onPress={onPress} style={({ pressed }) => [s.option, { opacity: disabled ? .4 : pressed ? .6 : 1 }]}><View style={s.optionIcon}><Ionicons name={icon} size={23} color={colors.accent} /></View><View style={{ flex: 1, gap: 4 }}><Text style={s.optionTitle}>{title}</Text><Text style={s.optionDescription}>{description}</Text></View><Ionicons name="chevron-forward" color={colors.muted} size={18} /></Pressable>;
}

export function SettingsScreen() {
  const experience = useExperienceStore();
  const sleepTimerEndAt = usePlayerStore(s => s.sleepTimerEndAt);
  const sleepAtEndOfTrack = usePlayerStore(s => s.sleepAtEndOfTrack);
  const playbackRate = usePlayerStore(s => s.playbackRate);
  const volume = usePlayerStore(s => s.volume);
  const reducedMotion = usePlayerStore(s => s.reducedMotion);
  const setSleepTimer = usePlayerStore(s => s.setSleepTimer);
  const setSleepAtEndOfTrack = usePlayerStore(s => s.setSleepAtEndOfTrack);
  const setPlaybackRate = usePlayerStore(s => s.setPlaybackRate);
  const setVolume = usePlayerStore(s => s.setVolume);
  const setReducedMotion = usePlayerStore(s => s.setReducedMotion);
  const clearHistory = usePlayerStore(s => s.clearHistory);
  const notify = useUIStore(s => s.notify);
  const [now, setNow] = useState(() => Date.now());
  const [clearing, setClearing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => { if (!sleepTimerEndAt) return; const interval = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(interval); }, [sleepTimerEndAt]);
  const remaining = Math.max(0, Math.ceil(((sleepTimerEndAt || 0) - now) / 1000));
  const countdown = `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}`;
  const transfer = async (kind: 'export' | 'import' | 'audio') => {
    if (busy) return;
    setBusy(kind);
    try {
      if (kind === 'export') { await exportLibrary(); notify('Backup preparado para compartilhar.'); }
      else { const count = await (kind === 'audio' ? importLocalTracks() : importLibrary()); if (count > 0) notify(kind === 'audio' ? `${count} músicas importadas para o celular.` : `${count} itens adicionados à biblioteca.`); }
    } catch (e) { notify(e instanceof Error ? e.message : 'Não foi possível concluir. Tente novamente.'); }
    finally { setBusy(null); }
  };

  const pickWallpaper = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'image/*',
        copyToCacheDirectory: true,
      });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        const uri = result.assets[0].uri;
        experience.configure({ customWallpaperUri: uri, wallpaperPreset: 'custom' });
        notify('Plano de fundo personalizado aplicado com efeito glass!');
      }
    } catch {
      notify('Não foi possível carregar a imagem.');
    }
  };

  return <View style={base.screen}><ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[base.content, { paddingBottom: 36 }]}>
    <View style={base.header}><IconButton name="arrow-back" label="Voltar" onPress={() => router.canGoBack() ? router.back() : router.replace('/')} /><Text style={[base.title, { fontSize: 27 }]}>Configurações</Text></View>
    <View style={s.intro}><Ionicons name="options-outline" color={colors.accent} size={27} /><View style={{ flex: 1, gap: 6 }}><Text style={s.introTitle}>Do seu jeito.</Text><Text style={base.subtitle}>Ajuste a reprodução e cuide da sua coleção.</Text></View></View>
    {Constants.executionEnvironment === 'storeClient' && <Section title="PRÉVIA NO EXPO GO"><View style={s.setting}><Text style={s.optionDescription}>A notificação e os controles com a tela bloqueada devem ser testados no APK instalado do Hueco Sound.</Text></View></Section>}
    <Section title="MIXAGEM ENTRE MÚSICAS (CROSSFADE)">
      <View style={s.setting}><Text style={s.optionTitle}>Transição contínua</Text><Text style={s.optionDescription}>Mistura o fim de uma música com o início da próxima sem silêncio, igual ao Spotify.</Text><View style={s.wrapChips}><Chip label="Desligada" active={experience.audioTransition === 'direct'} onPress={() => experience.configure({ audioTransition: 'direct' })} />{[1, 2, 3, 5, 8].map(seconds => <Chip key={seconds} label={`${seconds} s`} active={experience.audioTransition === 'fade' && experience.transitionSeconds === seconds} onPress={() => experience.configure({ audioTransition: 'fade', transitionSeconds: seconds })} />)}</View></View>
      {experience.audioTransition === 'fade' && <View style={s.setting}><Text style={s.optionTitle}>Curva da mixagem</Text><View style={s.wrapChips}><Chip label="Suave (DJ)" active={experience.fadeCurve === 'smooth'} onPress={() => experience.configure({ fadeCurve: 'smooth' })} /><Chip label="Linear" active={experience.fadeCurve === 'linear'} onPress={() => experience.configure({ fadeCurve: 'linear' })} /></View></View>}
    </Section>
    <Section title="PRECISA DE AJUDA?"><Pressable accessibilityRole="button" onPress={() => { const p = usePlayerStore.getState(); void Share.share({ message: JSON.stringify({ app: 'Hueco Sound 1.3.0', ambiente: Constants.executionEnvironment, faixa: p.currentTrack ? { id: p.currentTrack.id, titulo: p.currentTrack.title } : null, fila: p.queue.length, indice: p.currentIndex, tocando: p.isPlaying, carregando: p.isLoading, erro: p.error?.replace(/https?:\/\/[^\s]+/g, '[endereço omitido]') }, null, 2) }).catch(() => notify('Não foi possível abrir o diagnóstico.')); }} style={s.setting}><Text style={s.optionTitle}>Compartilhar diagnóstico de reprodução</Text><Text style={s.optionDescription}>Gera um resumo da faixa, fila e último erro, sem senhas nem URLs de áudio.</Text></Pressable></Section>
    <Section title="REPRODUÇÃO">
      <View style={s.setting}><Text style={s.optionTitle}>Velocidade</Text><Text style={s.optionDescription}>Ajuste o ritmo do áudio.</Text><View style={s.wrapChips}>{[.75, 1, 1.25, 1.5, 2].map(rate => <Chip key={rate} label={`${rate}×`} active={playbackRate === rate} onPress={() => setPlaybackRate(rate)} />)}</View></View>
      <View style={s.setting}><View style={s.between}><Text style={s.optionTitle}>Volume do aplicativo</Text><Text style={s.value}>{Math.round(volume * 100)}%</Text></View><View style={s.volumeRow}><IconButton name="volume-low-outline" label="Diminuir volume em 10%" disabled={volume <= 0} onPress={() => setVolume(Math.max(0, Math.round((volume - .1) * 10) / 10))} /><View style={s.volumeTrack}><View style={[s.volumeFill, { width: `${volume * 100}%` }]} /></View><IconButton name="volume-high-outline" label="Aumentar volume em 10%" disabled={volume >= 1} onPress={() => setVolume(Math.min(1, Math.round((volume + .1) * 10) / 10))} /></View></View>
    </Section>
    <Section title="TEMPORIZADOR">
      <View style={s.setting}><View style={s.between}><Text style={s.optionTitle}>Durma ouvindo</Text><Ionicons name="moon-outline" color={colors.accent} size={23} /></View><Text accessibilityLiveRegion="polite" style={s.optionDescription}>{sleepTimerEndAt ? `A reprodução pausa em ${countdown}.` : sleepAtEndOfTrack ? 'A reprodução pausa ao terminar a música atual.' : 'Escolha quando pausar a reprodução.'}</Text><View style={s.wrapChips}>{[15, 30, 45, 60].map(minutes => <Chip key={minutes} label={`${minutes} min`} onPress={() => { setNow(Date.now()); setSleepTimer(minutes); notify(`Temporizador definido para ${minutes} minutos.`); }} />)}{(sleepTimerEndAt || sleepAtEndOfTrack) && <Chip label="Desativar" active onPress={() => { setSleepTimer(null); setSleepAtEndOfTrack(false); notify('Temporizador desativado.'); }} />}</View></View>
      <View style={s.switchRow}><View style={{ flex: 1, gap: 5 }}><Text style={s.optionTitle}>Ao final desta música</Text><Text style={s.optionDescription}>Pausa quando a faixa atual terminar.</Text></View><Switch accessibilityLabel="Pausar ao final desta música" value={sleepAtEndOfTrack} onValueChange={setSleepAtEndOfTrack} trackColor={{ false: colors.elevated, true: '#577441' }} thumbColor={sleepAtEndOfTrack ? colors.accent : colors.muted} /></View>
    </Section>
    <Section title="APARÊNCIA">
      <View style={s.setting}><Text style={s.optionTitle}>Animação das capas e telas</Text><View style={s.wrapChips}>{([{ value: 'slide', label: 'Deslizar' }, { value: 'fade', label: 'Dissolver' }, { value: 'zoom', label: 'Zoom' }, { value: 'none', label: 'Sem animação' }] as const).map(option => <Chip key={option.value} label={option.label} active={experience.visualTransition === option.value} onPress={() => experience.configure({ visualTransition: option.value })} />)}</View></View>
      {([{ key: 'glassEnabled', title: 'Vidro e desfoque', description: 'Brilho translúcido nos cartões e capa desfocada no player.' }, { key: 'visualizerEnabled', title: 'Ondas animadas', description: 'Animação decorativa durante a reprodução, sem analisar o áudio.' }, { key: 'spritesEnabled', title: 'Personagens', description: 'Mostra os personagens nos cartões do Hueco Sound.' }] as const).map(option => <View key={option.key} style={s.switchRow}><View style={{ flex: 1, gap: 5 }}><Text style={s.optionTitle}>{option.title}</Text><Text style={s.optionDescription}>{option.description}</Text></View><Switch accessibilityLabel={option.title} value={experience[option.key]} onValueChange={value => experience.configure({ [option.key]: value })} trackColor={{ false: colors.elevated, true: '#237b69' }} thumbColor={experience[option.key] ? colors.accent : colors.muted} /></View>)}
      <View style={s.switchRow}><View style={{ flex: 1, gap: 5 }}><Text style={s.optionTitle}>Reduzir movimento</Text><Text style={s.optionDescription}>Transições mais discretas entre os controles.</Text></View><Switch accessibilityLabel="Reduzir movimento nas animações" value={reducedMotion} onValueChange={setReducedMotion} trackColor={{ false: colors.elevated, true: '#577441' }} thumbColor={reducedMotion ? colors.accent : colors.muted} /></View>
    </Section>
    <Section title="PERSONALIZAÇÃO & EFEITO GLASS">
      <View style={s.setting}>
        <Text style={s.optionTitle}>Plano de fundo do aplicativo</Text>
        <Text style={s.optionDescription}>Escolha um tema visual ou selecione uma foto do seu celular com efeito de vidro translúcido.</Text>
        <View style={s.wrapChips}>
          {([
            { id: 'default', label: 'Hueco Dark' },
            { id: 'neon', label: 'Cyberpunk Neon' },
            { id: 'midnight', label: 'Noite Estrelada' },
            { id: 'cyberpunk', label: 'Aurora Glass' },
          ] as const).map(wp => (
            <Chip
              key={wp.id}
              label={wp.label}
              active={experience.wallpaperPreset === wp.id && !experience.customWallpaperUri}
              onPress={() => experience.configure({ wallpaperPreset: wp.id, customWallpaperUri: null })}
            />
          ))}
          <Chip
            label={experience.customWallpaperUri ? 'Foto selecionada ✓' : 'Escolher foto...'}
            active={!!experience.customWallpaperUri}
            onPress={() => void pickWallpaper()}
          />
        </View>
        {experience.customWallpaperUri && (
          <Pressable accessibilityRole="button" onPress={() => experience.configure({ customWallpaperUri: null, wallpaperPreset: 'default' })} style={{ marginTop: 8 }}>
            <Text style={{ color: colors.danger, fontSize: 12, fontWeight: '700' }}>Remover foto e restaurar padrão</Text>
          </Pressable>
        )}
      </View>
      <View style={s.setting}>
        <Text style={s.optionTitle}>Intensidade do desfoque Glass</Text>
        <Text style={s.optionDescription}>Controla o nível de transparência sobre o plano de fundo.</Text>
        <View style={s.wrapChips}>
          {[15, 25, 45, 75].map(blur => (
            <Chip
              key={blur}
              label={`${blur}%`}
              active={experience.glassBlurIntensity === blur}
              onPress={() => experience.configure({ glassBlurIntensity: blur })}
            />
          ))}
        </View>
      </View>
      <View style={s.setting}>
        <Text style={s.optionTitle}>Opacidade dos cartões de vidro</Text>
        <View style={s.wrapChips}>
          {[{ val: 0.45, label: 'Translúcido' }, { val: 0.7, label: 'Médio' }, { val: 0.85, label: 'Sólido' }].map(op => (
            <Chip
              key={op.label}
              label={op.label}
              active={Math.abs(experience.glassOpacity - op.val) < 0.1}
              onPress={() => experience.configure({ glassOpacity: op.val })}
            />
          ))}
        </View>
      </View>
      <View style={s.setting}>
        <Text style={s.optionTitle}>Tema de destaque</Text>
        <View style={s.wrapChips}>
          {([
            { id: 'cyan', label: 'Hueco Cyan' },
            { id: 'purple', label: 'Cyber Roxo' },
            { id: 'emerald', label: 'Esmeralda' },
            { id: 'amber', label: 'Âmbar' },
            { id: 'rose', label: 'Neon Rosa' },
          ] as const).map(theme => (
            <Chip
              key={theme.id}
              label={theme.label}
              active={experience.accentTheme === theme.id}
              onPress={() => experience.configure({ accentTheme: theme.id })}
            />
          ))}
        </View>
      </View>
    </Section>
    <Section title="SUA BIBLIOTECA">
      <Option title={busy === 'audio' ? 'Importando músicas…' : 'Importar áudio do aparelho'} description="Adicione arquivos para ouvir também sem conexão." icon="phone-portrait-outline" disabled={!!busy} onPress={() => void transfer('audio')} />
      <Option title="Sua coleção e dados" description="Estatísticas locais, backups e armazenamento do aparelho." icon="person-circle-outline" onPress={() => router.push('/account')} />
      <Option title={busy === 'export' ? 'Preparando backup…' : 'Exportar biblioteca'} description="Salve playlists e curtidas em um arquivo JSON do Hueco Sound." icon="share-outline" disabled={!!busy} onPress={() => void transfer('export')} />
      <Option title={busy === 'import' ? 'Importando biblioteca…' : 'Importar backup'} description="Adicione playlists e curtidas de um backup do Hueco Sound." icon="download-outline" disabled={!!busy} onPress={() => void transfer('import')} />
      <Option title="Limpar histórico" description="Apague músicas recentes e buscas deste aparelho." icon="trash-outline" onPress={() => setClearing(true)} />
    </Section>
    <Section title="HUECO SOUND"><Option title="Sobre, créditos e termos" description="ZhyrSnow, identidade e termos do aplicativo." icon="information-circle-outline" onPress={() => router.push('/about')} /></Section>
    <View style={s.footer}><HuecoLogo width={200} /><Text style={s.footerText}>ZhyrSnow · Hueco Sound 1.3.1</Text></View>
  </ScrollView><ConfirmDialog visible={clearing} title="Limpar histórico?" description="As músicas recentes e o histórico de busca serão apagados. Suas playlists e curtidas continuam salvas." confirmLabel="Limpar" onClose={() => setClearing(false)} onConfirm={() => { clearHistory(); void AsyncStorage.multiRemove(['@hueco_search_history_v1', '@liner_search_history_v1']).catch(() => undefined); setClearing(false); notify('Histórico limpo.'); }} /></View>;
}

const s = StyleSheet.create({
  intro: { flexDirection: 'row', alignItems: 'center', gap: 17, marginHorizontal: 20, backgroundColor: '#12312e', borderRadius: 20, padding: 20, marginBottom: 8 },
  introTitle: { color: colors.text, fontSize: 24, fontWeight: '800', letterSpacing: -.5 },
  section: { marginHorizontal: 20, marginTop: 26 },
  sectionTitle: { color: colors.muted, fontSize: 10, fontWeight: '800', letterSpacing: 1.8, marginBottom: 12, paddingLeft: 4 },
  card: { borderRadius: 18, overflow: 'hidden' },
  setting: { padding: 18, gap: 9, borderBottomWidth: 1, borderBottomColor: colors.border },
  option: { flexDirection: 'row', alignItems: 'center', padding: 17, gap: 13, borderBottomWidth: 1, borderBottomColor: colors.border, minHeight: 90 },
  optionIcon: { width: 38, alignItems: 'center', justifyContent: 'center' },
  optionTitle: { color: colors.text, fontSize: 15, fontWeight: '700' },
  optionDescription: { color: colors.muted, fontSize: 12, lineHeight: 19 },
  wrapChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  value: { color: colors.accent, fontSize: 14, fontWeight: '800' },
  volumeRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  volumeTrack: { flex: 1, height: 5, borderRadius: 3, backgroundColor: colors.elevated, overflow: 'hidden' },
  volumeFill: { height: 5, backgroundColor: colors.accent },
  switchRow: { padding: 18, flexDirection: 'row', alignItems: 'center', gap: 18, minHeight: 88 },
  footer: { marginTop: 32, alignItems: 'center', gap: 6 },
  wordmark: { color: colors.text, fontWeight: '900', fontSize: 32, letterSpacing: -1.7 },
  footerText: { color: colors.muted, fontSize: 11 },
});

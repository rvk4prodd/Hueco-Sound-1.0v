import React, { useState } from 'react';
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useAudioFXStore } from '../preferences/audioFX';
import { usePlayerStore } from '../player/usePlayerStore';
import { useDeviceLibraryStore } from '../library/useDeviceLibraryStore';
import { useUIStore } from '../ui/useUIStore';
import { colors } from '../theme';
import type { SmartPlaylist, SmartPlaylistRule, Track } from '../types';

interface Props {
  visible: boolean;
  onClose: () => void;
}

export function SmartPlaylistModal({ visible, onClose }: Props) {
  const notify = useUIStore(s => s.notify);
  const playTrack = usePlayerStore(s => s.playTrack);
  const likedTracks = usePlayerStore(s => s.likedTracks);
  const recentTracks = usePlayerStore(s => s.recentTracks);
  const playlists = usePlayerStore(s => s.playlists);
  const createPlaylist = usePlayerStore(s => s.createPlaylist);
  const localTracks = useDeviceLibraryStore(s => s.localTracks);

  const smartPlaylists = useAudioFXStore(s => s.smartPlaylists);
  const addSmartPlaylist = useAudioFXStore(s => s.addSmartPlaylist);
  const removeSmartPlaylist = useAudioFXStore(s => s.removeSmartPlaylist);
  const playHistory = useAudioFXStore(s => s.playHistory);

  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [field, setField] = useState<SmartPlaylistRule['field']>('duration');
  const [operator, setOperator] = useState<SmartPlaylistRule['operator']>('greater_than');
  const [ruleValue, setRuleValue] = useState('210');
  const [limit, setLimit] = useState(30);

  // Get all unique candidate tracks from across library
  const allLibraryTracks = React.useMemo(() => {
    const map = new Map<string, Track>();
    likedTracks.forEach(t => map.set(t.id, t));
    recentTracks.forEach(t => map.set(t.id, t));
    localTracks.forEach(t => map.set(t.id, t));
    playlists.forEach(p => p.tracks.forEach(t => map.set(t.id, t)));
    return Array.from(map.values());
  }, [likedTracks, recentTracks, localTracks, playlists]);

  // Track play count mapping from history
  const playCountMap = React.useMemo(() => {
    const counts = new Map<string, number>();
    playHistory.forEach(h => {
      counts.set(h.trackId, (counts.get(h.trackId) || 0) + 1);
    });
    return counts;
  }, [playHistory]);

  const evaluateSmartPlaylist = (rules: SmartPlaylistRule[], maxLimit: number): Track[] => {
    return allLibraryTracks.filter(track => {
      return rules.every(rule => {
        if (rule.field === 'title') {
          const val = String(rule.value).toLowerCase();
          return rule.operator === 'contains'
            ? track.title.toLowerCase().includes(val)
            : track.title.toLowerCase() === val;
        }
        if (rule.field === 'artist') {
          const val = String(rule.value).toLowerCase();
          return rule.operator === 'contains'
            ? track.artists.toLowerCase().includes(val)
            : track.artists.toLowerCase() === val;
        }
        if (rule.field === 'duration') {
          const sec = (track.durationMs || 0) / 1000;
          const targetSec = Number(rule.value) || 0;
          return rule.operator === 'greater_than' ? sec > targetSec : sec < targetSec;
        }
        if (rule.field === 'playCount') {
          const count = playCountMap.get(track.id) || 0;
          const targetCount = Number(rule.value) || 1;
          return rule.operator === 'greater_than' ? count >= targetCount : count < targetCount;
        }
        return true;
      });
    }).slice(0, maxLimit);
  };

  const handlePlaySmart = (playlist: SmartPlaylist) => {
    const tracks = evaluateSmartPlaylist(playlist.rules, playlist.limit);
    if (tracks.length === 0) {
      notify('Nenhuma música encontrada para as regras desta Smart Playlist.');
      return;
    }
    void playTrack(tracks[0], tracks);
    notify(`Tocando Smart Playlist "${playlist.name}" (${tracks.length} faixas).`);
    onClose();
  };

  const handleExportAsRegularPlaylist = (playlist: SmartPlaylist) => {
    const tracks = evaluateSmartPlaylist(playlist.rules, playlist.limit);
    if (tracks.length === 0) {
      notify('Nenhuma faixa compatível encontrada.');
      return;
    }
    createPlaylist(playlist.name, tracks);
    notify(`Playlist "${playlist.name}" salva com ${tracks.length} músicas!`);
  };

  const handleCreateNew = () => {
    if (!name.trim()) {
      notify('Digite um nome para a Smart Playlist.');
      return;
    }

    const newRule: SmartPlaylistRule = {
      field,
      operator,
      value: field === 'duration' || field === 'playCount' ? Number(ruleValue) || 0 : ruleValue.trim(),
    };

    addSmartPlaylist({
      name: name.trim(),
      description: `Filtro automático: ${field} ${operator} ${ruleValue}`,
      rules: [newRule],
      limit,
    });

    notify(`Smart Playlist "${name.trim()}" criada!`);
    setName('');
    setCreating(false);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={s.overlay}>
        <View style={s.modalBox}>
          {/* Header */}
          <View style={s.header}>
            <View>
              <Text style={s.title}>⚡ Smart Playlists</Text>
              <Text style={s.subtitle}>Playlists geradas por regras automáticas</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={s.closeBtn}>
              <Text style={s.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={s.scrollArea} contentContainerStyle={s.scrollContent}>
            {!creating ? (
              <>
                <TouchableOpacity
                  activeOpacity={0.8}
                  style={s.createCardBtn}
                  onPress={() => setCreating(true)}
                >
                  <Text style={s.createCardIcon}>＋</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={s.createCardTitle}>Criar Nova Smart Playlist</Text>
                    <Text style={s.createCardDesc}>Defina filtros por tempo, artista ou contagem</Text>
                  </View>
                </TouchableOpacity>

                <Text style={s.sectionTitle}>Suas Playlists Inteligentes</Text>

                {smartPlaylists.map(playlist => {
                  const matchingCount = evaluateSmartPlaylist(playlist.rules, playlist.limit).length;
                  return (
                    <View key={playlist.id} style={s.playlistCard}>
                      <View style={s.playlistInfo}>
                        <View style={s.titleRow}>
                          <Text style={s.playlistName}>{playlist.name}</Text>
                          <View style={s.matchBadge}>
                            <Text style={s.matchBadgeText}>{matchingCount} faixas</Text>
                          </View>
                        </View>
                        <Text style={s.playlistDesc}>{playlist.description}</Text>
                        <Text style={s.rulesLabel}>
                          Regra: {playlist.rules.map(r => `${r.field} ${r.operator} ${r.value}`).join(', ')}
                        </Text>
                      </View>

                      <View style={s.cardActions}>
                        <TouchableOpacity
                          activeOpacity={0.7}
                          style={s.playBtn}
                          onPress={() => handlePlaySmart(playlist)}
                        >
                          <Text style={s.playBtnText}>▶ Tocar Agora</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          activeOpacity={0.7}
                          style={s.saveBtn}
                          onPress={() => handleExportAsRegularPlaylist(playlist)}
                        >
                          <Text style={s.saveBtnText}>📥 Salvar na Biblioteca</Text>
                        </TouchableOpacity>

                        {!['smart_top', 'smart_marathon'].includes(playlist.id) && (
                          <TouchableOpacity
                            onPress={() => removeSmartPlaylist(playlist.id)}
                            style={s.deleteBtn}
                          >
                            <Text style={s.deleteBtnText}>Excluir</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                  );
                })}
              </>
            ) : (
              /* CREATE SMART PLAYLIST FORM */
              <View style={s.formContainer}>
                <Text style={s.formTitle}>Nova Smart Playlist</Text>

                <Text style={s.inputLabel}>Nome da Playlist</Text>
                <TextInput
                  style={s.textInput}
                  placeholder="Ex: Músicas Longas para Viagem"
                  placeholderTextColor="rgba(255,255,255,0.3)"
                  value={name}
                  onChangeText={setName}
                />

                <Text style={s.inputLabel}>Critério de Filtro</Text>
                <View style={s.chipRow}>
                  {(
                    [
                      { key: 'duration', label: '⏱ Duração' },
                      { key: 'artist', label: '👤 Artista' },
                      { key: 'title', label: '🎵 Título' },
                      { key: 'playCount', label: '🔥 Reproduções' },
                    ] as const
                  ).map(opt => (
                    <TouchableOpacity
                      key={opt.key}
                      style={[s.chip, field === opt.key && s.chipActive]}
                      onPress={() => {
                        setField(opt.key);
                        if (opt.key === 'duration') setRuleValue('210');
                        else if (opt.key === 'playCount') setRuleValue('2');
                        else setRuleValue('');
                      }}
                    >
                      <Text style={[s.chipText, field === opt.key && s.chipTextActive]}>
                        {opt.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={s.inputLabel}>Condição</Text>
                <View style={s.chipRow}>
                  {field === 'duration' || field === 'playCount' ? (
                    <>
                      <TouchableOpacity
                        style={[s.chip, operator === 'greater_than' && s.chipActive]}
                        onPress={() => setOperator('greater_than')}
                      >
                        <Text style={[s.chipText, operator === 'greater_than' && s.chipTextActive]}>
                          Maior que
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[s.chip, operator === 'less_than' && s.chipActive]}
                        onPress={() => setOperator('less_than')}
                      >
                        <Text style={[s.chipText, operator === 'less_than' && s.chipTextActive]}>
                          Menor que
                        </Text>
                      </TouchableOpacity>
                    </>
                  ) : (
                    <>
                      <TouchableOpacity
                        style={[s.chip, operator === 'contains' && s.chipActive]}
                        onPress={() => setOperator('contains')}
                      >
                        <Text style={[s.chipText, operator === 'contains' && s.chipTextActive]}>
                          Contém
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[s.chip, operator === 'equals' && s.chipActive]}
                        onPress={() => setOperator('equals')}
                      >
                        <Text style={[s.chipText, operator === 'equals' && s.chipTextActive]}>
                          Igual a
                        </Text>
                      </TouchableOpacity>
                    </>
                  )}
                </View>

                <Text style={s.inputLabel}>
                  {field === 'duration'
                    ? 'Valor em segundos (Ex: 210 = 3min30s)'
                    : field === 'playCount'
                    ? 'Mínimo de vezes tocadas'
                    : 'Texto a filtrar'}
                </Text>
                <TextInput
                  style={s.textInput}
                  placeholder={field === 'duration' ? '210' : 'Nome ou termo'}
                  placeholderTextColor="rgba(255,255,255,0.3)"
                  value={ruleValue}
                  onChangeText={setRuleValue}
                  keyboardType={field === 'duration' || field === 'playCount' ? 'numeric' : 'default'}
                />

                <Text style={s.inputLabel}>Limite de Músicas</Text>
                <View style={s.chipRow}>
                  {[15, 30, 50, 100].map(val => (
                    <TouchableOpacity
                      key={val}
                      style={[s.chip, limit === val && s.chipActive]}
                      onPress={() => setLimit(val)}
                    >
                      <Text style={[s.chipText, limit === val && s.chipTextActive]}>{val} faixas</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <View style={s.formActions}>
                  <TouchableOpacity
                    style={s.cancelBtn}
                    onPress={() => setCreating(false)}
                  >
                    <Text style={s.cancelBtnText}>Voltar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={s.saveRuleBtn}
                    onPress={handleCreateNew}
                  >
                    <Text style={s.saveRuleBtnText}>Salvar Smart Playlist</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'flex-end',
  },
  modalBox: {
    backgroundColor: '#121318',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '88%',
    paddingBottom: 24,
    borderColor: 'rgba(255,255,255,0.1)',
    borderTopWidth: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  title: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '800',
  },
  subtitle: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    marginTop: 2,
  },
  closeBtn: {
    padding: 8,
  },
  closeBtnText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 18,
    fontWeight: 'bold',
  },
  scrollArea: {
    paddingHorizontal: 20,
  },
  scrollContent: {
    paddingVertical: 16,
    gap: 14,
  },
  createCardBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 229, 255, 0.08)',
    borderColor: colors.accent,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 14,
    padding: 14,
    gap: 12,
  },
  createCardIcon: {
    fontSize: 22,
    color: colors.accent,
    fontWeight: 'bold',
  },
  createCardTitle: {
    color: colors.accent,
    fontSize: 14,
    fontWeight: '700',
  },
  createCardDesc: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 11,
    marginTop: 2,
  },
  sectionTitle: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
    marginTop: 8,
  },
  playlistCard: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    gap: 12,
  },
  playlistInfo: {
    gap: 4,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  playlistName: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
    flex: 1,
  },
  matchBadge: {
    backgroundColor: 'rgba(0, 229, 255, 0.15)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  matchBadgeText: {
    color: colors.accent,
    fontSize: 11,
    fontWeight: '700',
  },
  playlistDesc: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 12,
  },
  rulesLabel: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 10,
    marginTop: 2,
  },
  cardActions: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  playBtn: {
    flex: 1,
    backgroundColor: colors.accent,
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
  },
  playBtnText: {
    color: '#000000',
    fontSize: 12,
    fontWeight: '700',
  },
  saveBtn: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
  },
  saveBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600',
  },
  deleteBtn: {
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  deleteBtnText: {
    color: '#ef4444',
    fontSize: 11,
  },
  // Form styles
  formContainer: {
    gap: 10,
  },
  formTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 6,
  },
  inputLabel: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 6,
  },
  textInput: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#ffffff',
    fontSize: 13,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  chipActive: {
    backgroundColor: 'rgba(0, 229, 255, 0.2)',
    borderColor: colors.accent,
  },
  chipText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 12,
  },
  chipTextActive: {
    color: colors.accent,
    fontWeight: '700',
  },
  formActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },
  cancelBtn: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  cancelBtnText: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 13,
    fontWeight: '600',
  },
  saveRuleBtn: {
    flex: 2,
    backgroundColor: colors.accent,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  saveRuleBtnText: {
    color: '#000000',
    fontSize: 13,
    fontWeight: '700',
  },
});

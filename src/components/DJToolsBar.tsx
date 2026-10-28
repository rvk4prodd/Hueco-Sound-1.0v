import React, { useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { useAudioFXStore, HOT_CUE_COLORS } from '../preferences/audioFX';
import { usePlayerStore } from '../player/usePlayerStore';
import { colors, themedStyles, useHuecoTheme } from '../theme';

function formatSec(seconds: number | null): string {
  if (seconds === null || Number.isNaN(seconds)) return '--:--';
  return String(seconds.toFixed(1)) + ' s';
}

export function DJToolsBar() {
 useHuecoTheme();
  const currentTrack = usePlayerStore(s => s.currentTrack);
  const positionMs = usePlayerStore(s => s.positionMs);
  const seekTo = usePlayerStore(s => s.seekTo);

  const hotCuesRecord = useAudioFXStore(s => s.hotCues);
  const setHotCue = useAudioFXStore(s => s.setHotCue);
  const clearHotCue = useAudioFXStore(s => s.clearHotCue);

  const abLoop = useAudioFXStore(s => s.abLoop);
  const setLoopPointA = useAudioFXStore(s => s.setLoopPointA);
  const setLoopPointB = useAudioFXStore(s => s.setLoopPointB);
  const toggleABLoop = useAudioFXStore(s => s.toggleABLoop);
  const clearABLoop = useAudioFXStore(s => s.clearABLoop);
  const nudgePointA = useAudioFXStore(s => s.nudgePointA);
  const nudgePointB = useAudioFXStore(s => s.nudgePointB);

  const [activeTab, setActiveTab] = useState<'cues' | 'loop'>('cues');

  const currentSec = Math.round(positionMs / 100) / 10;
  const currentSecPrecise = (positionMs / 1000).toFixed(1);
  const trackId = currentTrack?.id || '';
  const trackCues = (trackId && hotCuesRecord[trackId]) || [];

  const handleCuePress = (index: number) => {
    if (!trackId) return;
    const existing = trackCues.find(c => c.index === index);
    if (existing) {
      void seekTo(existing.positionSec * 1000);
    } else {
      setHotCue(trackId, index, currentSec);
    }
  };

  const handleCueLongPress = (index: number) => {
    if (!trackId) return;
    clearHotCue(trackId, index);
  };

  const handleSetA = () => {
    setLoopPointA(Math.round((positionMs / 1000) * 10) / 10);
  };

  const handleSetB = () => {
    setLoopPointB(Math.round((positionMs / 1000) * 10) / 10);
  };

  return (
    <View style={s.container}>
      {/* Top Selector: Cues or Loop */}
      <View style={s.headerRow}>
        <View style={s.tabGroup}>
          <TouchableOpacity
            activeOpacity={0.7}
            style={[s.tabButton, activeTab === 'cues' && s.tabButtonActive]}
            onPress={() => setActiveTab('cues')}
          >
            <Text style={[s.tabText, activeTab === 'cues' && s.tabTextActive]}>DJ Hot Cues</Text>
          </TouchableOpacity>
          <TouchableOpacity
            activeOpacity={0.7}
            style={[s.tabButton, activeTab === 'loop' && s.tabButtonActive]}
            onPress={() => setActiveTab('loop')}
          >
            <Text style={[s.tabText, activeTab === 'loop' && s.tabTextActive]}>
              Loop A-B {abLoop.enabled ? '● ATIVO' : ''}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={s.timeBadge}>
          <Text style={s.timeBadgeText}>⏱ {currentSecPrecise}s ({formatSec(currentSec)})</Text>
        </View>
      </View>

      {/* Mode 1: DJ HOT CUES */}
      {activeTab === 'cues' ? (
        <View style={s.cuesGrid}>
          {[0, 1, 2, 3].map(index => {
            const cue = trackCues.find(c => c.index === index);
            const cueColor = HOT_CUE_COLORS[index % HOT_CUE_COLORS.length];
            const isFilled = Boolean(cue);

            return (
              <TouchableOpacity
                key={index}
                activeOpacity={0.75}
                style={[
                  s.cuePad,
                  isFilled ? { borderColor: cueColor, backgroundColor: `${cueColor}22` } : s.cuePadEmpty,
                ]}
                onPress={() => handleCuePress(index)}
                onLongPress={() => handleCueLongPress(index)}
                delayLongPress={500}
              >
                <View style={s.cueTopRow}>
                  <View style={[s.cueDot, { backgroundColor: cueColor }]} />
                  <Text style={[s.cueNumber, { color: cueColor }]}>CUE {index + 1}</Text>
                  {isFilled && (
                    <TouchableOpacity
                      onPress={() => handleCueLongPress(index)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Text style={s.cueClearIcon}>×</Text>
                    </TouchableOpacity>
                  )}
                </View>

                {isFilled ? (
                  <View style={s.cueTimeWrapper}>
                    <Text style={[s.cueTime, { color: '#ffffff' }]}>{formatSec(cue!.positionSec)}</Text>
                    <Text style={s.cueSecondsExact}>({cue!.positionSec}s)</Text>
                  </View>
                ) : (
                  <View style={s.cueEmptyWrapper}>
                    <Text style={s.cueEmptyPlus}>+</Text>
                    <Text style={s.cueEmptyLabel}>Marcar aqui</Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      ) : (
        /* Mode 2: A-B LOOP */
        <View style={s.loopContainer}>
          <View style={s.loopPointsRow}>
            {/* Point A */}
            <View style={s.pointBox}>
              <View style={s.pointHeader}>
                <Text style={s.pointTagA}>Ponto A (Início)</Text>
                <Text style={s.pointSecDisplay}>
                  {abLoop.pointA !== null ? `${abLoop.pointA.toFixed(1)}s (${formatSec(abLoop.pointA)})` : 'Não definido'}
                </Text>
              </View>
              <View style={s.pointActionsRow}>
                <TouchableOpacity activeOpacity={0.8} style={s.setPointBtn} onPress={handleSetA}>
                  <Text style={s.setPointBtnText}>🎯 Fixar em {currentSecPrecise}s</Text>
                </TouchableOpacity>
                {abLoop.pointA !== null && (
                  <View style={s.nudgeRow}>
                    <TouchableOpacity activeOpacity={0.7} style={s.nudgeBtn} onPress={() => nudgePointA(-0.5)}>
                      <Text style={s.nudgeBtnText}>-0.5s</Text>
                    </TouchableOpacity>
                    <TouchableOpacity activeOpacity={0.7} style={s.nudgeBtn} onPress={() => nudgePointA(0.5)}>
                      <Text style={s.nudgeBtnText}>+0.5s</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            </View>

            {/* Point B */}
            <View style={s.pointBox}>
              <View style={s.pointHeader}>
                <Text style={s.pointTagB}>Ponto B (Fim)</Text>
                <Text style={s.pointSecDisplay}>
                  {abLoop.pointB !== null ? `${abLoop.pointB.toFixed(1)}s (${formatSec(abLoop.pointB)})` : 'Não definido'}
                </Text>
              </View>
              <View style={s.pointActionsRow}>
                <TouchableOpacity activeOpacity={0.8} style={s.setPointBtn} onPress={handleSetB}>
                  <Text style={s.setPointBtnText}>🎯 Fixar em {currentSecPrecise}s</Text>
                </TouchableOpacity>
                {abLoop.pointB !== null && (
                  <View style={s.nudgeRow}>
                    <TouchableOpacity activeOpacity={0.7} style={s.nudgeBtn} onPress={() => nudgePointB(-0.5)}>
                      <Text style={s.nudgeBtnText}>-0.5s</Text>
                    </TouchableOpacity>
                    <TouchableOpacity activeOpacity={0.7} style={s.nudgeBtn} onPress={() => nudgePointB(0.5)}>
                      <Text style={s.nudgeBtnText}>+0.5s</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            </View>
          </View>

          {/* Loop Controls Bar */}
          <View style={s.loopControlsRow}>
            <TouchableOpacity
              activeOpacity={0.8}
              style={[s.toggleLoopBtn, abLoop.enabled && s.toggleLoopBtnActive]}
              onPress={() => toggleABLoop()}
            >
              <Text style={[s.toggleLoopBtnText, abLoop.enabled && s.toggleLoopBtnTextActive]}>
                {abLoop.enabled ? '🔁 LOOP ATIVADO' : '▶ ATIVAR LOOP A-B'}
              </Text>
            </TouchableOpacity>

            {(abLoop.pointA !== null || abLoop.pointB !== null) && (
              <TouchableOpacity activeOpacity={0.7} style={s.clearLoopBtn} onPress={clearABLoop}>
                <Text style={s.clearLoopBtnText}>Limpar</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}
    </View>
  );
}

const s = themedStyles(() => ({
  container: {
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderRadius: 14,
    padding: 10,
    marginTop: 8,
    marginBottom: 4,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  tabGroup: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
    borderRadius: 8,
    padding: 2,
    gap: 4,
  },
  tabButton: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 6,
  },
  tabButtonActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
  },
  tabText: {
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.5)',
  },
  tabTextActive: {
    color: '#ffffff',
  },
  timeBadge: {
    backgroundColor: 'rgba(0, 229, 255, 0.12)',
    borderColor: 'rgba(0, 229, 255, 0.3)',
    borderWidth: 1,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
  },
  timeBadgeText: {
    color: colors.accent,
    fontSize: 10,
    fontWeight: '700',
  },
  // Cues
  cuesGrid: {
    flexDirection: 'row',
    gap: 8,
  },
  cuePad: {
    flex: 1,
    height: 60,
    borderRadius: 10,
    borderWidth: 1.5,
    padding: 6,
    justifyContent: 'space-between',
  },
  cuePadEmpty: {
    borderColor: 'rgba(255, 255, 255, 0.1)',
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
  },
  cueTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cueDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  cueNumber: {
    fontSize: 9,
    fontWeight: '800',
    flex: 1,
    marginLeft: 4,
  },
  cueClearIcon: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 14,
  },
  cueTimeWrapper: {
    alignItems: 'center',
  },
  cueTime: {
    fontSize: 13,
    fontWeight: '800',
  },
  cueSecondsExact: {
    fontSize: 9,
    color: 'rgba(255, 255, 255, 0.5)',
    fontWeight: '600',
  },
  cueEmptyWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
  cueEmptyPlus: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.35)',
    lineHeight: 16,
  },
  cueEmptyLabel: {
    fontSize: 9,
    color: 'rgba(255, 255, 255, 0.35)',
    fontWeight: '600',
  },
  // Loop
  loopContainer: {
    gap: 8,
  },
  loopPointsRow: {
    gap: 6,
  },
  pointBox: {
    backgroundColor: 'rgba(0, 0, 0, 0.25)',
    borderRadius: 8,
    padding: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  pointHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  pointTagA: {
    color: '#00e5ff',
    fontSize: 11,
    fontWeight: '700',
  },
  pointTagB: {
    color: '#f59e0b',
    fontSize: 11,
    fontWeight: '700',
  },
  pointSecDisplay: {
    color: 'rgba(255, 255, 255, 0.85)',
    fontSize: 11,
    fontWeight: '700',
  },
  pointActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  setPointBtn: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 6,
    paddingVertical: 5,
    paddingHorizontal: 8,
    alignItems: 'center',
  },
  setPointBtnText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '600',
  },
  nudgeRow: {
    flexDirection: 'row',
    gap: 4,
  },
  nudgeBtn: {
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: 6,
    paddingVertical: 5,
    paddingHorizontal: 6,
  },
  nudgeBtnText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '700',
  },
  loopControlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 2,
  },
  toggleLoopBtn: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderColor: 'rgba(255, 255, 255, 0.15)',
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
  },
  toggleLoopBtnActive: {
    backgroundColor: 'rgba(0, 229, 255, 0.25)',
    borderColor: colors.accent,
  },
  toggleLoopBtnText: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 11,
    fontWeight: '700',
  },
  toggleLoopBtnTextActive: {
    color: colors.accent,
    fontWeight: '800',
  },
  clearLoopBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderColor: 'rgba(239, 68, 68, 0.3)',
    borderWidth: 1,
    borderRadius: 8,
  },
  clearLoopBtnText: {
    color: '#ef4444',
    fontSize: 11,
    fontWeight: '700',
  },
}));

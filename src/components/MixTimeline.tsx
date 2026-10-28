import React, { useEffect, useMemo, useRef, useState } from 'react';
import { PanResponder, Text, View } from 'react-native';
import Svg, { Line, Path, Polyline, Rect, Text as SvgText } from 'react-native-svg';
import type { Track } from '../types';
import { analyzeWaveform, type Waveform } from '../player/waveform';
import { defaultCurves, effectLevel, mixFrame, type MixAutomation, type MixCurves, type MixPoint } from '../player/mixAutomation';

function Handle({ point, x, y, scale, gainHeight, fixed, onChange }: { point: MixPoint; x: number; y: number; scale: number; gainHeight: number; fixed: boolean; onChange: (point: MixPoint) => void }) {
  const origin = useRef(point), latestPoint = useRef(point), latest = useRef(onChange);
  useEffect(() => { latest.current = onChange; latestPoint.current = point; }, [onChange, point]);
  // PanResponder stores these callbacks; ref access happens only during a native gesture.
  // eslint-disable-next-line react-hooks/refs
  const responder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: () => { origin.current = latestPoint.current; },
    onPanResponderMove: (_, gesture) => latest.current({ time: fixed ? origin.current.time : Math.max(.01, Math.min(.99, origin.current.time + gesture.dx / Math.max(1, scale))), gain: Math.max(0, Math.min(1, origin.current.gain - gesture.dy / Math.max(1, gainHeight))) }),
  }), [scale, gainHeight, fixed]);
  return <View {...responder.panHandlers} accessibilityLabel="Ponto da curva de volume" style={{ position: 'absolute', left: x - 14, top: y - 14, width: 28, height: 28, alignItems: 'center', justifyContent: 'center' }}><View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: '#bce5fc', borderWidth: 1, borderColor: '#15212a' }} /></View>;
}
export function MixTimeline({ a, b, seconds, out, cue, config, onChange }: { a: Track; b: Track; seconds: number; out: number; cue: number; config: MixAutomation; onChange: (curves: MixCurves) => void }) {
  const [width, setWidth] = useState(320), [waves, setWaves] = useState<[Waveform | null, Waveform | null]>([null, null]), [message, setMessage] = useState('Analisando áudio real…');
  useEffect(() => {
    const controller = new AbortController();
    void Promise.all([analyzeWaveform(a, controller.signal), analyzeWaveform(b, controller.signal)]).then(result => { if (!controller.signal.aborted) { setWaves(result); setMessage('Arraste os pontos azuis para desenhar o volume.'); } }).catch(error => { if (!controller.signal.aborted) setMessage(error instanceof Error ? error.message : 'Forma de onda indisponível.'); });
    return () => controller.abort();
  }, [a, b]);
  const height = width * 230 / 360, start = 3 / (seconds + 6) * 360, length = seconds / (seconds + 6) * 360;
  const curves = config.curves ?? defaultCurves(config.volume);
  const waveform = (lane: number) => Array.from({ length: 180 }, (_, i) => {
    const wave = waves[lane]; if (!wave) return '';
    const time = (lane ? cue : out) - 3 + i / 179 * (seconds + 6);
    const peak = time < 0 || time > wave.duration ? 0 : wave.peaks[Math.min(wave.peaks.length - 1, Math.floor(time / wave.duration * wave.peaks.length))] || 0;
    return `M${i * 2},${(lane ? 170 : 65) - peak * 27}v${peak * 54}`;
  }).join(' ');
  return <View style={{ borderRadius: 16, backgroundColor: '#202324', overflow: 'hidden' }}>
    <View onLayout={e => setWidth(e.nativeEvent.layout.width)} style={{ height }}>
      <Svg width={width} height={height} viewBox="0 0 360 230">
        {Array.from({ length: 9 }, (_, i) => <Line key={i} x1={i * 45} x2={i * 45} y1={0} y2={230} stroke="#ffffff0d" />)}
        <Rect x={start} y={10} width={length} height={205} rx={10} fill="#ffffff0a" stroke="#ffffff18" />
        {[0, 1].map(lane => <Path key={lane} d={waveform(lane)} stroke="#e5e7e9" strokeWidth={1.3} opacity={.7} />)}
        {(['out', 'in'] as const).map((lane, laneIndex) => <React.Fragment key={lane}>
          <Polyline points={Array.from({ length: 60 }, (_, i) => { const t = i / 59; return `${start + t * length},${(laneIndex ? 197 : 92) - mixFrame(t, config)[lane] * 54}`; }).join(' ')} fill="none" stroke="#86c4e8" strokeWidth={2} />
          <Polyline points={Array.from({ length: 60 }, (_, i) => { const t = i / 59, frame = mixFrame(t, config), tone = laneIndex ? frame.incomingTone : frame.outgoingTone; return `${start + t * length},${(laneIndex ? 197 : 92) - (1 + tone.bassDb / 24) * 54}`; }).join(' ')} fill="none" stroke="#d5bd64" strokeWidth={1.2} />
          <Polyline points={Array.from({ length: 60 }, (_, i) => { const t = i / 59, frame = mixFrame(t, config); return `${start + t * length},${(laneIndex ? 197 : 92) - effectLevel(laneIndex ? frame.incomingTone : frame.outgoingTone) * 54}`; }).join(' ')} fill="none" stroke="#d7a4f4" strokeWidth={1.2} />
        </React.Fragment>)}
        <SvgText x={12} y={18} fill="#c6cbcd" fontSize={9}>SAÍDA · {out.toFixed(1)} s</SvgText><SvgText x={12} y={123} fill="#c6cbcd" fontSize={9}>ENTRADA · {cue.toFixed(1)} s</SvgText>
      </Svg>
      {(['out', 'in'] as const).flatMap((lane, laneIndex) => curves[lane].map((point, i) => <Handle key={`${lane}-${i}`} point={point} x={(start + point.time * length) / 360 * width} y={((laneIndex ? 197 : 92) - point.gain * 54) / 230 * height} scale={length / 360 * width} gainHeight={54 * width / 360} fixed={i === 0 || i === curves[lane].length - 1} onChange={next => onChange({ ...curves, [lane]: curves[lane].map((p, j) => j === i ? next : p) })} />))}
    </View>
    <Text style={{ color: '#b8c2c6', fontSize: 11, padding: 12 }}>{message}</Text>
    <Text style={{ color: '#aeb9bd', fontSize: 10, paddingHorizontal: 12, paddingBottom: 12 }}>Azul: volume · Amarelo: EQ · Roxo: efeitos</Text>
  </View>;
}

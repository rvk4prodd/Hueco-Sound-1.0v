import React, { useEffect, useState } from 'react';
import { Animated, type ViewProps } from 'react-native';
import { usePlayerStore } from '../player/usePlayerStore';
import { useExperienceStore } from '../preferences/experience';
export function MotionView({ children, style, ...props }: ViewProps) {
 const reduced = usePlayerStore(s => s.reducedMotion);
 const motion = useExperienceStore(s => s.visualTransition);
 const [progress] = useState(() => new Animated.Value(reduced ? 1 : 0));
 useEffect(() => { progress.setValue(reduced || motion === 'none' ? 1 : 0); const animation = Animated.timing(progress, { toValue: 1, duration: reduced || motion === 'none' ? 0 : 280, useNativeDriver: true }); animation.start(); return () => animation.stop(); }, [progress, reduced, motion]);
 const transform = motion === 'zoom' ? [{ scale: progress.interpolate({ inputRange: [0,1], outputRange: [.94,1] }) }] : motion === 'slide' ? [{ translateY: progress.interpolate({ inputRange: [0,1], outputRange: [16,0] }) }] : [];
 return <Animated.View {...props} style={[style, { opacity: progress, transform }]}>{children}</Animated.View>;
}

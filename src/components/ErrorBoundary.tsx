import React, { Component, type ReactNode } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { colors } from '../theme';
import { addLog } from '../diagnostics/logs';
export class ErrorBoundary extends Component<{children: ReactNode}, {failed: boolean}> {
 state = { failed: false };
 static getDerivedStateFromError() { return { failed: true }; }
 componentDidCatch(error: Error) { addLog('error', 'interface', error); console.error('Hueco Sound:', error.message); }
 render() { if (!this.state.failed) return this.props.children; return <View style={styles.wrap}><Text style={styles.title}>Vamos tentar de novo.</Text><Text style={styles.text}>Não foi possível exibir esta tela. Suas playlists continuam salvas.</Text><Pressable accessibilityRole="button" style={styles.button} onPress={() => this.setState({ failed: false })}><Text style={styles.buttonText}>Reabrir interface</Text></Pressable></View>; }
}
const styles = StyleSheet.create({ wrap: { flex: 1, backgroundColor: colors.background, justifyContent: 'center', padding: 32, gap: 20 }, title: { color: colors.text, fontSize: 28, fontWeight: '800' }, text: { color: colors.muted, lineHeight: 24 }, button: { padding: 18, backgroundColor: colors.accent, borderRadius: 32 }, buttonText: { color: colors.background, textAlign: 'center', fontWeight: '700' } });

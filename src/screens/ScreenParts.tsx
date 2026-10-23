import React, { useRef } from 'react';
import { ActivityIndicator, Image, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

export function IconButton({ name, label, onPress, color = colors.text, disabled = false }: { name: IconName; label: string; onPress: () => void; color?: string; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={onPress} style={({ pressed }) => [s.iconButton, { opacity: disabled ? .25 : pressed ? .55 : 1 }]}><Ionicons name={name} size={23} color={color} /></Pressable>;
}

export function Cover({ uri, size = 64, icon = 'musical-notes', color = '#364333', round = false }: { uri?: string; size?: number; icon?: IconName; color?: string; round?: boolean }) {
  const [failedUri, setFailedUri] = React.useState<string | undefined>();
  return <View style={{ width: size, height: size, borderRadius: round ? size / 2 : 10, backgroundColor: color, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
    {uri && uri !== failedUri ? <Image accessibilityIgnoresInvertColors source={{ uri }} onError={() => setFailedUri(uri)} style={{ width: size, height: size }} /> : <Ionicons name={icon} size={size * .36} color={colors.text} />}
  </View>;
}

export function Chip({ label, active, onPress }: { label: string; active?: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ selected: !!active }} onPress={onPress} style={({ pressed }) => [s.chip, active && s.activeChip, pressed && { opacity: .7 }]}><Text style={[s.chipText, active && { color: '#101710' }]}>{label}</Text></Pressable>;
}

export function ActionButton({ label, onPress, icon, secondary, disabled }: { label: string; onPress: () => void; icon?: IconName; secondary?: boolean; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled: !!disabled }} disabled={disabled} onPress={onPress} style={({ pressed }) => [s.actionButton, secondary && { backgroundColor: colors.elevated }, { opacity: disabled ? .4 : pressed ? .7 : 1 }]}>
    {icon && <Ionicons name={icon} size={19} color={secondary ? colors.text : '#101710'} />}<Text style={[s.actionText, secondary && { color: colors.text }]}>{label}</Text>
  </Pressable>;
}

export function EmptyState({ title, description, icon = 'musical-notes-outline', action, onAction, loading }: { title: string; description?: string; icon?: IconName; action?: string; onAction?: () => void; loading?: boolean }) {
  return <View style={s.empty}>{loading ? <ActivityIndicator color={colors.accent} size="large" /> : <View style={s.emptyIcon}><Ionicons name={icon} size={32} color={colors.accent} /></View>}<Text style={s.emptyTitle}>{title}</Text>{description && <Text style={s.emptyDescription}>{description}</Text>}{action && onAction && <ActionButton label={action} onPress={onAction} />}</View>;
}

export function NameDialog({ visible, title, initialValue = '', onClose, onSave }: { visible: boolean; title: string; initialValue?: string; onClose: () => void; onSave: (name: string) => void }) {
  const [value, setValue] = React.useState(initialValue);
  const input = useRef<React.ComponentRef<typeof TextInput>>(null);
  const submit = () => { if (value.trim()) onSave(value.trim()); };
  return <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose} onShow={() => { setValue(initialValue); input.current?.focus(); }}>
    <KeyboardAvoidingView style={s.modal} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Fechar" />
      <View accessibilityViewIsModal style={s.dialog}><Text style={s.dialogTitle}>{title}</Text><TextInput ref={input} accessibilityLabel="Nome da playlist" value={value} onChangeText={setValue} style={s.nameInput} placeholder="Minha playlist" placeholderTextColor={colors.muted} maxLength={80} returnKeyType="done" onSubmitEditing={submit} autoCapitalize="sentences" /><View style={s.dialogActions}><ActionButton secondary label="Cancelar" onPress={onClose} /><ActionButton label="Salvar" disabled={!value.trim()} onPress={submit} /></View></View>
    </KeyboardAvoidingView>
  </Modal>;
}

export function ConfirmDialog({ visible, title, description, confirmLabel = 'Excluir', onClose, onConfirm }: { visible: boolean; title: string; description: string; confirmLabel?: string; onClose: () => void; onConfirm: () => void }) {
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}><View style={s.modal}><Pressable style={StyleSheet.absoluteFill} accessibilityLabel="Cancelar" onPress={onClose} /><View accessibilityViewIsModal style={s.dialog}><Text style={s.dialogTitle}>{title}</Text><Text style={{ color: colors.muted, fontSize: 15, lineHeight: 23 }}>{description}</Text><View style={s.dialogActions}><ActionButton secondary label="Cancelar" onPress={onClose} /><ActionButton label={confirmLabel} onPress={onConfirm} /></View></View></View></Modal>;
}

export const screenStyles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { paddingBottom: 24 },
  header: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 20, flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { color: colors.text, fontSize: 29, fontWeight: '800', letterSpacing: -.8, flex: 1 },
  eyebrow: { color: colors.accent, fontSize: 11, fontWeight: '800', letterSpacing: 2, marginBottom: 8 },
  subtitle: { color: colors.muted, fontSize: 14, lineHeight: 21 },
  section: { color: colors.text, fontSize: 22, fontWeight: '800', letterSpacing: -.4 },
  sectionRow: { paddingHorizontal: 20, marginTop: 26, marginBottom: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  inputWrap: { backgroundColor: colors.surface, marginHorizontal: 20, borderRadius: 14, height: 52, flexDirection: 'row', alignItems: 'center', paddingLeft: 15, borderColor: colors.border, borderWidth: 1, gap: 10, marginBottom: 18 },
  input: { color: colors.text, flex: 1, fontSize: 15, height: 52, paddingVertical: 0 },
  chips: { flexDirection: 'row', paddingHorizontal: 20, gap: 8, paddingBottom: 14 },
  link: { color: colors.muted, fontSize: 12, fontWeight: '700' },
});

const s = StyleSheet.create({
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22 },
  chip: { borderRadius: 24, paddingHorizontal: 17, minHeight: 40, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  activeChip: { backgroundColor: colors.accent },
  chipText: { color: colors.text, fontSize: 13, fontWeight: '700' },
  actionButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 46, paddingHorizontal: 21, borderRadius: 25, backgroundColor: colors.accent },
  actionText: { color: '#101710', fontWeight: '800', fontSize: 14 },
  empty: { alignItems: 'center', paddingHorizontal: 30, paddingVertical: 40, gap: 15 },
  emptyIcon: { width: 76, height: 76, borderRadius: 26, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { color: colors.text, fontSize: 21, fontWeight: '800', textAlign: 'center' },
  emptyDescription: { color: colors.muted, fontSize: 14, textAlign: 'center', lineHeight: 22, maxWidth: 330 },
  modal: { flex: 1, justifyContent: 'center', paddingHorizontal: 24, backgroundColor: '#00000099' },
  dialog: { backgroundColor: colors.elevated, borderRadius: 22, padding: 24, maxWidth: 480, width: '100%', alignSelf: 'center' },
  dialogTitle: { fontSize: 22, fontWeight: '800', color: colors.text, marginBottom: 22 },
  nameInput: { height: 54, borderRadius: 12, paddingHorizontal: 15, fontSize: 17, color: colors.text, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background },
  dialogActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 24 },
});

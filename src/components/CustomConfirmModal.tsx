import React, { useState, useEffect } from 'react';
import { Modal, View, Text, StyleSheet, TouchableOpacity, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { useTheme } from '../context/ThemeContext';

interface CustomConfirmModalProps {
  visible: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: (text?: string) => void;
  onCancel: () => void;
  isDestructive?: boolean;
  showCancel?: boolean;
  showInput?: boolean;
  inputPlaceholder?: string;
  defaultValue?: string;
}

export default function CustomConfirmModal({
  visible,
  title,
  message,
  confirmText = 'Да',
  cancelText = 'Отмена',
  onConfirm,
  onCancel,
  isDestructive = false,
  showCancel = true,
  showInput = false,
  inputPlaceholder = '',
  defaultValue = '',
}: CustomConfirmModalProps) {
  const { theme, isDark } = useTheme();
  const shadowColor = isDark ? '#000' : '#0F172A';
  const [text, setText] = useState(defaultValue);

  useEffect(() => {
    if (visible) {
      setText(defaultValue);
    }
  }, [visible, defaultValue]);

  return (
    <Modal
      transparent
      visible={visible}
      animationType="fade"
      onRequestClose={onCancel}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.overlay}
      >
        <View
          style={[
            styles.card,
            {
              backgroundColor: theme.card,
              borderColor: theme.border,
              shadowColor,
              shadowOpacity: isDark ? 0.4 : 0.08,
            },
          ]}
        >
          <Text style={[styles.title, { color: theme.text }]}>{title}</Text>
          {message ? <Text style={[styles.message, { color: theme.subtext }]}>{message}</Text> : null}

          {showInput && (
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: theme.inputBg,
                  color: theme.text,
                  borderColor: theme.border,
                },
              ]}
              placeholder={inputPlaceholder}
              placeholderTextColor={theme.subtext}
              value={text}
              onChangeText={setText}
              autoFocus
            />
          )}

          <View style={styles.actions}>
            {showCancel && (
              <TouchableOpacity
                style={[
                  styles.btn,
                  styles.cancelBtn,
                  { backgroundColor: theme.inputBg, borderColor: theme.border },
                ]}
                onPress={onCancel}
                activeOpacity={0.8}
              >
                <Text style={[styles.cancelBtnText, { color: theme.text }]}>{cancelText}</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={[
                styles.btn,
                styles.confirmBtn,
                { backgroundColor: isDestructive ? theme.danger : theme.accent },
              ]}
              onPress={() => onConfirm(text)}
              activeOpacity={0.8}
            >
              <Text style={styles.confirmBtnText}>{confirmText}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 340,
    borderRadius: 24,
    borderWidth: 1,
    padding: 24,
    shadowOffset: { width: 0, height: 12 },
    shadowRadius: 24,
    elevation: 8,
    alignItems: 'center',
  },
  title: {
    fontSize: 16,
    fontWeight: '900',
    textAlign: 'center',
    marginBottom: 12,
    lineHeight: 22,
  },
  message: {
    fontSize: 13,
    fontWeight: '500',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 18,
  },
  input: {
    width: '100%',
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    fontSize: 14,
    marginBottom: 20,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    width: '100%',
  },
  btn: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelBtn: {
    borderWidth: 1,
  },
  cancelBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
  confirmBtn: {
    elevation: 1,
  },
  confirmBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
});

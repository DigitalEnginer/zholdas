import React from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { supabase } from '../lib/supabase';
import { RootStackParamList } from '../types';
import { useTheme } from '../context/ThemeContext';
import { useLanguage } from '../context/LanguageContext';
import { useHaptics } from '../hooks/useHaptics';

type Nav = NativeStackNavigationProp<RootStackParamList>;

function getPasswordResetRedirectUrl() {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return `${window.location.origin}/reset-password`;
  }

  return 'zholdas://reset-password';
}

export default function ForgotPasswordScreen() {
  const navigation = useNavigation<Nav>();
  const { theme } = useTheme();
  const { t } = useLanguage();
  const haptics = useHaptics();
  const [email, setEmail] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');
  const [showSuccessModal, setShowSuccessModal] = React.useState(false);
  const [isFocused, setIsFocused] = React.useState(false);

  async function handleSend() {
    const normalizedEmail = email.trim();
    setError('');

    if (!normalizedEmail) {
      setError(t('emailRequired'));
      haptics.error();
      return;
    }

    if (!/\S+@\S+\.\S+/.test(normalizedEmail)) {
      setError(t('invalidEmail'));
      haptics.error();
      return;
    }

    setLoading(true);
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
      redirectTo: getPasswordResetRedirectUrl(),
    });
    setLoading(false);

    if (resetError) {
      setError(resetError.message);
      haptics.error();
      return;
    }

    haptics.success();
    setShowSuccessModal(true);
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.hero}>
            <View style={[styles.icon, { backgroundColor: theme.accentLight, borderColor: theme.border }]}>
              <Text style={[styles.iconText, { color: theme.accent }]}>?</Text>
            </View>
            <Text style={[styles.title, { color: theme.text }]}>{t('restorePassword')}</Text>
            <Text style={[styles.subtitle, { color: theme.subtext }]}>{t('resetPasswordHint')}</Text>
          </View>

          <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.label, { color: theme.subtext }]}>Email</Text>
            <TextInput
              style={[
                styles.input,
                { backgroundColor: theme.inputBg, color: theme.text, borderColor: theme.border },
                isFocused && { borderColor: theme.accent },
                error && { borderColor: theme.danger },
              ]}
              placeholder="your@email.com"
              placeholderTextColor={theme.subtext + 'AA'}
              value={email}
              onChangeText={value => {
                setEmail(value);
                setError('');
              }}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
            />
            {error ? <Text style={[styles.errorText, { color: theme.danger }]}>{error}</Text> : null}

            <TouchableOpacity
              style={[styles.primaryBtn, loading && styles.disabled]}
              onPress={handleSend}
              disabled={loading}
              activeOpacity={0.85}
            >
              <LinearGradient
                colors={loading ? [theme.accent + '88', theme.accent + '88'] : [theme.accent, '#4F46E5']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.primaryGradient}
              >
                <Text style={styles.primaryText}>{loading ? t('loading') : t('sendResetLink')}</Text>
              </LinearGradient>
            </TouchableOpacity>

            <TouchableOpacity style={styles.secondaryBtn} onPress={() => navigation.goBack()} activeOpacity={0.75}>
              <Text style={[styles.secondaryText, { color: theme.accent }]}>{t('backToLogin')}</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {showSuccessModal && (
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <LinearGradient
              colors={[theme.accent, '#4F46E5']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.modalIconContainer}
            >
              <Text style={styles.modalIconEmoji}>✉️</Text>
            </LinearGradient>
            <Text style={[styles.modalTitle, { color: theme.text }]}>
              {t('registerSuccessTitle')}
            </Text>
            <Text style={[styles.modalText, { color: theme.subtext }]}>
              {t('resetEmailSent')}
            </Text>
            <TouchableOpacity
              style={styles.modalBtn}
              onPress={() => {
                setShowSuccessModal(false);
                navigation.goBack();
              }}
              activeOpacity={0.8}
            >
              <LinearGradient
                colors={[theme.accent, '#4F46E5']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.modalBtnGradient}
              >
                <Text style={styles.modalBtnText}>OK</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: 20, paddingBottom: 40 },
  hero: { alignItems: 'center', marginBottom: 24 },
  icon: {
    width: 64,
    height: 64,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  iconText: { fontSize: 34, fontWeight: '900' },
  title: { fontSize: 28, fontWeight: '900', textAlign: 'center', marginBottom: 8 },
  subtitle: { fontSize: 15, lineHeight: 21, textAlign: 'center', maxWidth: 340 },
  card: {
    borderRadius: 24,
    borderWidth: 1,
    padding: 24,
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.06,
    shadowRadius: 24,
    elevation: 4,
  },
  label: { fontSize: 12, fontWeight: '800', marginBottom: 8, textTransform: 'uppercase' },
  input: { borderRadius: 16, paddingHorizontal: 16, paddingVertical: 14, fontSize: 15, borderWidth: 1.5 },
  errorText: { fontSize: 12, marginTop: 8, fontWeight: '600' },
  primaryBtn: { borderRadius: 16, overflow: 'hidden', marginTop: 24 },
  primaryGradient: { paddingVertical: 16, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: '#FFF', fontSize: 16, fontWeight: '900' },
  disabled: { opacity: 0.65 },
  secondaryBtn: { alignItems: 'center', paddingTop: 18 },
  secondaryText: { fontSize: 15, fontWeight: '800' },
  modalOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    zIndex: 1000,
  },
  modalCard: {
    width: '100%',
    maxWidth: 400,
    padding: 32,
    borderRadius: 28,
    borderWidth: 1.5,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.25,
    shadowRadius: 32,
    elevation: 8,
  },
  modalIconContainer: {
    width: 72,
    height: 72,
    borderRadius: 36,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    shadowColor: '#4F46E5',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 4,
  },
  modalIconEmoji: { fontSize: 32 },
  modalTitle: { fontSize: 22, fontWeight: '900', textAlign: 'center', marginBottom: 12, letterSpacing: -0.3 },
  modalText: { fontSize: 14, fontWeight: '500', textAlign: 'center', lineHeight: 22, marginBottom: 24 },
  modalBtn: { width: '100%', borderRadius: 16, overflow: 'hidden' },
  modalBtnGradient: { paddingVertical: 14, alignItems: 'center', justifyContent: 'center' },
  modalBtnText: { fontSize: 16, fontWeight: '800', color: '#FFF' },
});

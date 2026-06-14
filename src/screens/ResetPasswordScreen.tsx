import React from 'react';
import {
  Alert,
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

export default function ResetPasswordScreen() {
  const navigation = useNavigation<Nav>();
  const { theme } = useTheme();
  const { t } = useLanguage();
  const haptics = useHaptics();
  const [password, setPassword] = React.useState('');
  const [confirmPassword, setConfirmPassword] = React.useState('');
  const [showPassword, setShowPassword] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');

  async function handleUpdatePassword() {
    setError('');

    if (password.length < 6) {
      setError(t('passwordMinLength'));
      haptics.error();
      return;
    }

    if (password !== confirmPassword) {
      setError(t('passwordsDoNotMatch'));
      haptics.error();
      return;
    }

    setLoading(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (updateError) {
      setError(updateError.message);
      haptics.error();
      return;
    }

    haptics.success();
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined') {
        window.alert(t('passwordChanged'));
      }
    } else {
      Alert.alert(t('done'), t('passwordChanged'));
    }

    navigation.reset({ index: 0, routes: [{ name: 'Main' }] });
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.hero}>
            <View style={[styles.icon, { backgroundColor: theme.accentLight, borderColor: theme.border }]}>
              <Text style={[styles.iconText, { color: theme.accent }]}>✓</Text>
            </View>
            <Text style={[styles.title, { color: theme.text }]}>{t('newPasswordTitle')}</Text>
            <Text style={[styles.subtitle, { color: theme.subtext }]}>{t('newPasswordHint')}</Text>
          </View>

          <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.label, { color: theme.subtext }]}>{t('passwordPlaceholder')}</Text>
            <View>
              <TextInput
                style={[styles.input, styles.passwordInput, { backgroundColor: theme.inputBg, color: theme.text, borderColor: error ? theme.danger : theme.border }]}
                placeholder="********"
                placeholderTextColor={theme.subtext + 'AA'}
                value={password}
                onChangeText={value => {
                  setPassword(value);
                  setError('');
                }}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
              />
              <TouchableOpacity style={styles.eyeBtn} onPress={() => setShowPassword(v => !v)} activeOpacity={0.7}>
                <Text style={[styles.eyeText, { color: theme.accent }]}>{showPassword ? t('hide') : t('show')}</Text>
              </TouchableOpacity>
            </View>

            <Text style={[styles.label, { color: theme.subtext }]}>{t('confirmPassword')}</Text>
            <TextInput
              style={[styles.input, { backgroundColor: theme.inputBg, color: theme.text, borderColor: error ? theme.danger : theme.border }]}
              placeholder="********"
              placeholderTextColor={theme.subtext + 'AA'}
              value={confirmPassword}
              onChangeText={value => {
                setConfirmPassword(value);
                setError('');
              }}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
            />
            {error ? <Text style={[styles.errorText, { color: theme.danger }]}>{error}</Text> : null}

            <TouchableOpacity
              style={[styles.primaryBtn, loading && styles.disabled]}
              onPress={handleUpdatePassword}
              disabled={loading}
              activeOpacity={0.85}
            >
              <LinearGradient
                colors={loading ? [theme.accent + '88', theme.accent + '88'] : [theme.accent, '#4F46E5']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.primaryGradient}
              >
                <Text style={styles.primaryText}>{loading ? t('loading') : t('saveNewPassword')}</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
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
  iconText: { fontSize: 30, fontWeight: '900' },
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
  label: { fontSize: 12, fontWeight: '800', marginBottom: 8, marginTop: 16, textTransform: 'uppercase' },
  input: { borderRadius: 16, paddingHorizontal: 16, paddingVertical: 14, fontSize: 15, borderWidth: 1.5 },
  passwordInput: { paddingRight: 82 },
  eyeBtn: { position: 'absolute', right: 12, top: 8, padding: 8 },
  eyeText: { fontSize: 13, fontWeight: '800' },
  errorText: { fontSize: 12, marginTop: 8, fontWeight: '600' },
  primaryBtn: { borderRadius: 16, overflow: 'hidden', marginTop: 28 },
  primaryGradient: { paddingVertical: 16, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: '#FFF', fontSize: 16, fontWeight: '900' },
  disabled: { opacity: 0.65 },
});

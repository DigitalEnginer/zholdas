import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Image,
  KeyboardAvoidingView, Platform, ScrollView, SafeAreaView,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
import { RootStackParamList } from '../types';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useHaptics } from '../hooks/useHaptics';
import { useLanguage } from '../context/LanguageContext';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const ZholdasLogo = ({ theme }: { theme: any }) => (
  <View style={logoStyles.container}>
    <Image source={require('../../assets/icon.png')} style={logoStyles.image} />
    <View style={[logoStyles.circleIndicator, { backgroundColor: theme.success, borderColor: theme.bg }]} />
  </View>
);

const logoStyles = StyleSheet.create({
  container: {
    width: 64,
    height: 64,
    position: 'relative',
    alignSelf: 'center',
    marginBottom: 16,
  },
  image: {
    width: 64,
    height: 64,
    borderRadius: 20,
    shadowColor: '#4F46E5',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 4,
  },
  circleIndicator: {
    position: 'absolute',
    bottom: -1,
    right: -1,
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2.5,
  },
});

export default function LoginScreen() {
  const navigation = useNavigation<Nav>();
  const { login } = useAuth();
  const { theme } = useTheme();
  const haptics = useHaptics();
  const { t } = useLanguage();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [isEmailFocused, setIsEmailFocused] = useState(false);
  const [isPasswordFocused, setIsPasswordFocused] = useState(false);

  function validate() {
    const e: typeof errors = {};
    if (!email.trim()) e.email = t('emailRequired');
    else if (!/\S+@\S+\.\S+/.test(email)) e.email = t('invalidEmail');
    if (!password) e.password = t('passwordRequired');
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleLogin() {
    if (!validate()) { haptics.error(); return; }
    setLoading(true);
    try {
      await login(email.trim(), password);
      haptics.success();
    } catch (err: any) {
      haptics.error();
      setErrors({ password: err.message });
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <View style={styles.hero}>
            <ZholdasLogo theme={theme} />
            <Text style={[styles.appName, { color: theme.text }]}>Жолдас</Text>
            <Text style={[styles.tagline, { color: theme.subtext }]}>{t('loginTitle')}</Text>
          </View>

          <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.cardTitle, { color: theme.text }]}>{t('loginButton')}</Text>

            <Text style={[styles.label, { color: theme.subtext }]}>Email</Text>
            <TextInput
              style={[
                styles.input,
                { backgroundColor: theme.inputBg, color: theme.text, borderColor: theme.border },
                isEmailFocused && { borderColor: theme.accent },
                errors.email && { borderColor: theme.danger },
              ]}
              placeholder="your@email.com"
              placeholderTextColor={theme.subtext + 'AA'}
              value={email}
              onChangeText={value => { setEmail(value); setErrors(e => ({ ...e, email: undefined })); }}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              onFocus={() => setIsEmailFocused(true)}
              onBlur={() => setIsEmailFocused(false)}
            />
            {errors.email && <Text style={[styles.errorText, { color: theme.danger }]}>{errors.email}</Text>}

            <Text style={[styles.label, { color: theme.subtext }]}>{t('passwordPlaceholder')}</Text>
            <View style={styles.passwordRow}>
              <TextInput
                style={[
                  styles.input,
                  styles.passwordInput,
                  { backgroundColor: theme.inputBg, color: theme.text, borderColor: theme.border },
                  isPasswordFocused && { borderColor: theme.accent },
                  errors.password && { borderColor: theme.danger },
                ]}
                placeholder="********"
                placeholderTextColor={theme.subtext + 'AA'}
                value={password}
                onChangeText={value => { setPassword(value); setErrors(e => ({ ...e, password: undefined })); }}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                onFocus={() => setIsPasswordFocused(true)}
                onBlur={() => setIsPasswordFocused(false)}
              />
              <TouchableOpacity
                style={styles.eyeBtn}
                onPress={() => setShowPassword(v => !v)}
                activeOpacity={0.7}
              >
                <Text style={[styles.eyeText, { color: theme.accent }]}>
                  {showPassword ? t('hide') : t('show')}
                </Text>
              </TouchableOpacity>
            </View>
            {errors.password && <Text style={[styles.errorText, { color: theme.danger }]}>{errors.password}</Text>}

            <TouchableOpacity
              style={styles.forgotBtn}
              onPress={() => navigation.navigate('ForgotPassword')}
              activeOpacity={0.7}
            >
              <Text style={[styles.forgotText, { color: theme.accent }]}>{t('forgotPassword')}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.loginBtn, loading && styles.loginBtnDisabled]}
              onPress={handleLogin}
              disabled={loading}
              activeOpacity={0.85}
            >
              <LinearGradient
                colors={loading ? [theme.accent + '88', theme.accent + '88'] : [theme.accent, '#4F46E5']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.loginGradient}
              >
                <Text style={styles.loginBtnText}>{loading ? t('loading') : t('loginButton')}</Text>
              </LinearGradient>
            </TouchableOpacity>

            <View style={styles.divider}>
              <View style={[styles.dividerLine, { backgroundColor: theme.border }]} />
              <Text style={[styles.dividerText, { color: theme.subtext }]}>{t('or')}</Text>
              <View style={[styles.dividerLine, { backgroundColor: theme.border }]} />
            </View>

            <TouchableOpacity
              style={[styles.registerBtn, { borderColor: theme.accent }]}
              onPress={() => navigation.navigate('Register' as any)}
              activeOpacity={0.85}
            >
              <Text style={[styles.registerBtnText, { color: theme.accent }]}>{t('registerButton')}</Text>
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
  scroll: { padding: 20, paddingBottom: 40 },
  hero: { alignItems: 'center', paddingTop: 36, paddingBottom: 24 },
  appName: { fontSize: 32, fontWeight: '900', marginTop: 4, letterSpacing: -0.5 },
  tagline: { fontSize: 15, marginTop: 6, fontWeight: '500' },
  card: {
    borderRadius: 24, padding: 24,
    borderWidth: 1,
    width: '100%', maxWidth: 480, alignSelf: 'center',
    shadowColor: '#0F172A', shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.06, shadowRadius: 24, elevation: 4,
  },
  cardTitle: { fontSize: 24, fontWeight: '900', marginBottom: 20, letterSpacing: -0.5 },
  label: { fontSize: 12, fontWeight: '700', marginBottom: 8, marginTop: 16, textTransform: 'uppercase', letterSpacing: 0.5 },
  input: {
    borderRadius: 16,
    paddingHorizontal: 16, paddingVertical: 14,
    fontSize: 15,
    borderWidth: 1.5,
  },
  passwordRow: { flexDirection: 'row', alignItems: 'center', width: '100%' },
  passwordInput: { borderRadius: 16, flex: 1 },
  eyeBtn: { position: 'absolute', right: 16, padding: 8 },
  eyeText: { fontSize: 13, fontWeight: '700' },
  errorText: { fontSize: 12, marginTop: 6, fontWeight: '500' },
  forgotBtn: { alignSelf: 'flex-end', marginTop: 12, paddingVertical: 4 },
  forgotText: { fontSize: 13, fontWeight: '700' },
  loginBtn: {
    borderRadius: 16,
    overflow: 'hidden',
    marginTop: 28,
  },
  loginGradient: {
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loginBtnDisabled: { opacity: 0.6 },
  loginBtnText: { fontSize: 16, fontWeight: '800', color: '#FFF' },
  divider: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 24 },
  dividerLine: { flex: 1, height: 1 },
  dividerText: { fontSize: 13, fontWeight: '500' },
  registerBtn: {
    borderRadius: 16, paddingVertical: 15, alignItems: 'center',
    borderWidth: 2,
  },
  registerBtnText: { fontSize: 16, fontWeight: '800' },
});

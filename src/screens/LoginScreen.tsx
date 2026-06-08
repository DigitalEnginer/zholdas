import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, Alert, SafeAreaView,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types';
import { useAuth } from '../context/AuthContext';
import { useHaptics } from '../hooks/useHaptics';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function LoginScreen() {
  const navigation = useNavigation<Nav>();
  const { login } = useAuth();
  const haptics = useHaptics();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});

  function validate() {
    const e: typeof errors = {};
    if (!email.trim()) e.email = 'Введите email';
    else if (!/\S+@\S+\.\S+/.test(email)) e.email = 'Неверный формат email';
    if (!password) e.password = 'Введите пароль';
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
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <View style={styles.hero}>
            <Text style={styles.logo}>🤝</Text>
            <Text style={styles.appName}>Жолдас</Text>
            <Text style={styles.tagline}>Найди компанию в Алматы</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Войти</Text>

            <Text style={styles.label}>Email</Text>
            <TextInput
              style={[styles.input, errors.email && styles.inputError]}
              placeholder="your@email.com"
              placeholderTextColor="#BBB"
              value={email}
              onChangeText={t => { setEmail(t); setErrors(e => ({ ...e, email: undefined })); }}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />
            {errors.email && <Text style={styles.errorText}>{errors.email}</Text>}

            <Text style={styles.label}>Пароль</Text>
            <View style={styles.passwordRow}>
              <TextInput
                style={[styles.input, styles.passwordInput, errors.password && styles.inputError]}
                placeholder="••••••••"
                placeholderTextColor="#BBB"
                value={password}
                onChangeText={t => { setPassword(t); setErrors(e => ({ ...e, password: undefined })); }}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
              />
              <TouchableOpacity
                style={styles.eyeBtn}
                onPress={() => setShowPassword(v => !v)}
              >
                <Text style={styles.eyeText}>{showPassword ? '🙈' : '👁️'}</Text>
              </TouchableOpacity>
            </View>
            {errors.password && <Text style={styles.errorText}>{errors.password}</Text>}

            <TouchableOpacity style={styles.forgotBtn} onPress={() => Alert.alert('Восстановление пароля', 'Письмо с инструкциями отправлено на ' + email)}>
              <Text style={styles.forgotText}>Забыли пароль?</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.loginBtn, loading && styles.loginBtnDisabled]}
              onPress={handleLogin}
              disabled={loading}
              activeOpacity={0.85}
            >
              <Text style={styles.loginBtnText}>{loading ? 'Входим...' : 'Войти'}</Text>
            </TouchableOpacity>

            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>или</Text>
              <View style={styles.dividerLine} />
            </View>

            <TouchableOpacity
              style={styles.registerBtn}
              onPress={() => navigation.navigate('Register' as any)}
              activeOpacity={0.85}
            >
              <Text style={styles.registerBtnText}>Создать аккаунт</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F7FF' },
  flex: { flex: 1 },
  scroll: { padding: 20, paddingBottom: 40 },
  hero: { alignItems: 'center', paddingVertical: 32 },
  logo: { fontSize: 56, marginBottom: 10 },
  appName: { fontSize: 32, fontWeight: '900', color: '#1A1A2E' },
  tagline: { fontSize: 15, color: '#888', marginTop: 4 },
  card: {
    backgroundColor: '#FFF', borderRadius: 24, padding: 24,
    shadowColor: '#5B4FCF', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1, shadowRadius: 16, elevation: 4,
  },
  cardTitle: { fontSize: 22, fontWeight: '800', color: '#1A1A2E', marginBottom: 20 },
  label: { fontSize: 13, fontWeight: '700', color: '#888', marginBottom: 6, marginTop: 14, textTransform: 'uppercase', letterSpacing: 0.5 },
  input: {
    backgroundColor: '#F8F7FF', borderRadius: 14,
    paddingHorizontal: 16, paddingVertical: 13,
    fontSize: 15, color: '#1A1A2E',
    borderWidth: 1.5, borderColor: '#E8E5FF', flex: 1,
  },
  inputError: { borderColor: '#FF4D4D' },
  passwordRow: { flexDirection: 'row', alignItems: 'center' },
  passwordInput: { borderRadius: 14 },
  eyeBtn: { position: 'absolute', right: 14, padding: 4 },
  eyeText: { fontSize: 18 },
  errorText: { fontSize: 12, color: '#FF4D4D', marginTop: 4 },
  forgotBtn: { alignSelf: 'flex-end', marginTop: 8 },
  forgotText: { fontSize: 13, color: '#5B4FCF', fontWeight: '600' },
  loginBtn: {
    backgroundColor: '#5B4FCF', borderRadius: 16,
    paddingVertical: 16, alignItems: 'center', marginTop: 24,
  },
  loginBtnDisabled: { backgroundColor: '#C5BFFF' },
  loginBtnText: { fontSize: 16, fontWeight: '800', color: '#FFF' },
  divider: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 20 },
  dividerLine: { flex: 1, height: 1, backgroundColor: '#E8E5FF' },
  dividerText: { fontSize: 13, color: '#AAA' },
  registerBtn: {
    borderRadius: 16, paddingVertical: 15, alignItems: 'center',
    borderWidth: 2, borderColor: '#5B4FCF',
  },
  registerBtnText: { fontSize: 16, fontWeight: '700', color: '#5B4FCF' },
});

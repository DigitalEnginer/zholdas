import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, SafeAreaView,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types';
import { useAuth, AVATARS } from '../context/AuthContext';
import { useHaptics } from '../hooks/useHaptics';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Gender = 'male' | 'female' | 'not_specified';

const GENDER_OPTIONS: Array<{ key: Gender; label: string; emoji: string }> = [
  { key: 'male', label: 'Мужской', emoji: '👨' },
  { key: 'female', label: 'Женский', emoji: '👩' },
  { key: 'not_specified', label: 'Не указывать', emoji: '🙂' },
];

const CURRENT_YEAR = new Date().getFullYear();

export default function RegisterScreen() {
  const navigation = useNavigation<Nav>();
  const { register } = useAuth();
  const haptics = useHaptics();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [bio, setBio] = useState('');
  const [avatarIndex, setAvatarIndex] = useState(0);
  const [gender, setGender] = useState<Gender>('not_specified');
  const [birthYear, setBirthYear] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  function validate() {
    const e: Record<string, string> = {};
    if (!name.trim() || name.trim().length < 2) e.name = 'Имя минимум 2 символа';
    if (!email.trim() || !/\S+@\S+\.\S+/.test(email)) e.email = 'Неверный формат email';
    if (!password || password.length < 6) e.password = 'Пароль минимум 6 символов';
    if (password !== confirmPassword) e.confirmPassword = 'Пароли не совпадают';
    if (birthYear) {
      const y = parseInt(birthYear, 10);
      if (isNaN(y) || y < 1920 || y > CURRENT_YEAR - 13) e.birthYear = 'Укажи корректный год (напр. 1995)';
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleRegister() {
    if (!validate()) { haptics.error(); return; }
    setLoading(true);
    try {
      const year = birthYear ? parseInt(birthYear, 10) : CURRENT_YEAR - 18;
      await register(name.trim(), email.trim(), password, avatarIndex, bio.trim(), gender, year);
      haptics.success();
    } catch (err: any) {
      haptics.error();
      setErrors({ email: err.message });
    } finally {
      setLoading(false);
    }
  }

  function field(
    label: string, value: string, onChange: (t: string) => void,
    opts: { placeholder?: string; key?: string; secureText?: boolean; keyboard?: any } = {}
  ) {
    const err = opts.key ? errors[opts.key] : undefined;
    return (
      <>
        <Text style={styles.label}>{label}</Text>
        <TextInput
          style={[styles.input, err && styles.inputError]}
          placeholder={opts.placeholder ?? ''}
          placeholderTextColor="#BBB"
          value={value}
          onChangeText={t => { onChange(t); if (opts.key) setErrors(e => ({ ...e, [opts.key!]: '' })); }}
          secureTextEntry={opts.secureText}
          keyboardType={opts.keyboard}
          autoCapitalize={opts.keyboard === 'email-address' || opts.keyboard === 'number-pad' ? 'none' : 'words'}
          autoCorrect={false}
        />
        {err ? <Text style={styles.errorText}>{err}</Text> : null}
      </>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <Text style={styles.title}>Создать аккаунт</Text>
          <Text style={styles.subtitle}>Присоединяйся к сообществу Жолдас</Text>

          <View style={styles.card}>
            <Text style={styles.label}>Выбери аватар</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
              <View style={styles.avatarRow}>
                {AVATARS.map((emoji, i) => (
                  <TouchableOpacity
                    key={i}
                    style={[styles.avatarBtn, avatarIndex === i && styles.avatarBtnActive]}
                    onPress={() => { setAvatarIndex(i); haptics.light(); }}
                  >
                    <Text style={styles.avatarEmoji}>{emoji}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            {field('Имя *', name, setName, { placeholder: 'Как тебя зовут?', key: 'name' })}
            {field('Email *', email, setEmail, { placeholder: 'your@email.com', key: 'email', keyboard: 'email-address' })}

            <Text style={styles.label}>Пароль *</Text>
            <View style={styles.passwordRow}>
              <TextInput
                style={[styles.input, styles.flex, errors.password && styles.inputError]}
                placeholder="Минимум 6 символов"
                placeholderTextColor="#BBB"
                value={password}
                onChangeText={t => { setPassword(t); setErrors(e => ({ ...e, password: '' })); }}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
              />
              <TouchableOpacity style={styles.eyeBtn} onPress={() => setShowPassword(v => !v)}>
                <Text>{showPassword ? '🙈' : '👁️'}</Text>
              </TouchableOpacity>
            </View>
            {errors.password ? <Text style={styles.errorText}>{errors.password}</Text> : null}

            {field('Подтверди пароль *', confirmPassword, setConfirmPassword, {
              placeholder: '••••••••', key: 'confirmPassword', secureText: !showPassword,
            })}

            <Text style={styles.label}>Пол</Text>
            <View style={styles.genderRow}>
              {GENDER_OPTIONS.map(opt => (
                <TouchableOpacity
                  key={opt.key}
                  style={[styles.genderBtn, gender === opt.key && styles.genderBtnActive]}
                  onPress={() => { setGender(opt.key); haptics.light(); }}
                  activeOpacity={0.8}
                >
                  <Text style={styles.genderEmoji}>{opt.emoji}</Text>
                  <Text style={[styles.genderLabel, gender === opt.key && styles.genderLabelActive]}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {field('Год рождения', birthYear, setBirthYear, {
              placeholder: 'Напр. 1995',
              key: 'birthYear',
              keyboard: 'number-pad',
            })}

            {field('О себе', bio, setBio, { placeholder: 'Пара слов о тебе...' })}

            <View style={styles.previewRow}>
              <View style={styles.previewAvatar}>
                <Text style={{ fontSize: 28 }}>{AVATARS[avatarIndex]}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.previewName}>{name || 'Твоё имя'}</Text>
                <Text style={styles.previewEmail}>{email || 'email@example.com'}</Text>
                {birthYear ? (
                  <Text style={styles.previewAge}>
                    {CURRENT_YEAR - parseInt(birthYear || '2000', 10)} лет ·{' '}
                    {gender === 'male' ? '👨 Мужской' : gender === 'female' ? '👩 Женский' : '🙂 Не указан'}
                  </Text>
                ) : null}
              </View>
            </View>

            <TouchableOpacity
              style={[styles.registerBtn, loading && styles.registerBtnDisabled]}
              onPress={handleRegister}
              disabled={loading}
              activeOpacity={0.85}
            >
              <Text style={styles.registerBtnText}>{loading ? 'Создаём...' : 'Создать аккаунт 🚀'}</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.loginLink} onPress={() => navigation.goBack()}>
              <Text style={styles.loginLinkText}>
                Уже есть аккаунт? <Text style={{ color: '#4F46E5', fontWeight: '700' }}>Войти</Text>
              </Text>
            </TouchableOpacity>
          </View>
          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F6F7FB' },
  flex: { flex: 1 },
  scroll: { padding: 20, paddingTop: 32 },
  title: { fontSize: 28, fontWeight: '900', color: '#111827', marginBottom: 4, width: '100%', maxWidth: 640, alignSelf: 'center' },
  subtitle: { fontSize: 15, color: '#667085', marginBottom: 24, width: '100%', maxWidth: 640, alignSelf: 'center' },
  card: {
    backgroundColor: '#FFF', borderRadius: 18, padding: 20,
    borderWidth: 1, borderColor: '#E4E7EC',
    width: '100%', maxWidth: 640, alignSelf: 'center',
    shadowColor: '#101828', shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.08, shadowRadius: 24, elevation: 4,
  },
  label: {
    fontSize: 12, fontWeight: '700', color: '#667085',
    marginBottom: 6, marginTop: 14,
    textTransform: 'uppercase',
  },
  input: {
    backgroundColor: '#F9FAFB', borderRadius: 12,
    paddingHorizontal: 16, paddingVertical: 13,
    fontSize: 15, color: '#111827', borderWidth: 1.5, borderColor: '#E4E7EC',
  },
  inputError: { borderColor: '#D92D20' },
  errorText: { fontSize: 12, color: '#D92D20', marginTop: 4 },
  avatarRow: { flexDirection: 'row', gap: 8 },
  avatarBtn: {
    width: 52, height: 52, borderRadius: 26,
    justifyContent: 'center', alignItems: 'center',
    backgroundColor: '#F9FAFB', borderWidth: 2, borderColor: 'transparent',
  },
  avatarBtnActive: { borderColor: '#4F46E5', backgroundColor: '#EEF2FF' },
  avatarEmoji: { fontSize: 26 },
  passwordRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  eyeBtn: { padding: 10 },
  genderRow: { flexDirection: 'row', gap: 8 },
  genderBtn: {
    flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 14,
    backgroundColor: '#F9FAFB', borderWidth: 1.5, borderColor: '#E4E7EC',
  },
  genderBtnActive: { backgroundColor: '#EEF2FF', borderColor: '#4F46E5' },
  genderEmoji: { fontSize: 22, marginBottom: 4 },
  genderLabel: { fontSize: 11, color: '#667085', fontWeight: '600', textAlign: 'center' },
  genderLabelActive: { color: '#4338CA' },
  previewRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    marginTop: 20, padding: 14, backgroundColor: '#F9FAFB', borderRadius: 14,
  },
  previewAvatar: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: '#EEF2FF', justifyContent: 'center', alignItems: 'center',
  },
  previewName: { fontSize: 15, fontWeight: '700', color: '#111827' },
  previewEmail: { fontSize: 12, color: '#667085', marginTop: 2 },
  previewAge: { fontSize: 11, color: '#4338CA', marginTop: 2 },
  registerBtn: {
    backgroundColor: '#4F46E5', borderRadius: 14,
    paddingVertical: 16, alignItems: 'center', marginTop: 20,
  },
  registerBtnDisabled: { backgroundColor: '#C7D2FE' },
  registerBtnText: { fontSize: 16, fontWeight: '800', color: '#FFF' },
  loginLink: { alignItems: 'center', paddingVertical: 16 },
  loginLinkText: { fontSize: 14, color: '#667085' },
});

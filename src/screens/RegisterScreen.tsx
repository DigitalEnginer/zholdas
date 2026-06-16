import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, SafeAreaView, Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
import { RootStackParamList } from '../types';
import { useAuth, AVATARS } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useHaptics } from '../hooks/useHaptics';
import { useLanguage } from '../context/LanguageContext';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Gender = 'male' | 'female' | 'not_specified';

const GENDER_OPTIONS: Array<{ key: Gender; labelKey: string; emoji: string }> = [
  { key: 'male', labelKey: 'genderMale', emoji: '👨' },
  { key: 'female', labelKey: 'genderFemale', emoji: '👩' },
  { key: 'not_specified', labelKey: 'genderNotSpecified', emoji: '🙂' },
];

const CURRENT_YEAR = new Date().getFullYear();

interface FormFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  errorKey?: string;
  keyboard?: any;
  errors: Record<string, string>;
  setErrors: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  theme: any;
}

const FormField = ({
  label, value, onChange, placeholder, errorKey, keyboard, errors, setErrors, theme,
}: FormFieldProps) => {
  const [focused, setFocused] = useState(false);
  const err = errorKey ? errors[errorKey] : undefined;

  return (
    <View style={styles.fieldContainer}>
      <Text style={[styles.label, { color: theme.subtext }]}>{label}</Text>
      <TextInput
        style={[
          styles.input,
          { backgroundColor: theme.inputBg, color: theme.text, borderColor: theme.border },
          focused && { borderColor: theme.accent },
          err && { borderColor: theme.danger },
        ]}
        placeholder={placeholder ?? ''}
        placeholderTextColor={theme.subtext + 'AA'}
        value={value}
        onChangeText={nextValue => {
          onChange(nextValue);
          if (errorKey) setErrors(e => ({ ...e, [errorKey]: '' }));
        }}
        keyboardType={keyboard}
        autoCapitalize={keyboard === 'email-address' || keyboard === 'number-pad' ? 'none' : 'words'}
        autoCorrect={false}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      />
      {err ? <Text style={[styles.errorText, { color: theme.danger }]}>{err}</Text> : null}
    </View>
  );
};

interface PasswordFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  errorKey?: string;
  showPassword: boolean;
  setShowPassword: React.Dispatch<React.SetStateAction<boolean>>;
  errors: Record<string, string>;
  setErrors: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  theme: any;
}

const PasswordField = ({
  label, value, onChange, placeholder, errorKey, showPassword, setShowPassword, errors, setErrors, theme,
}: PasswordFieldProps) => {
  const [focused, setFocused] = useState(false);
  const err = errorKey ? errors[errorKey] : undefined;
  const { t } = useLanguage();

  return (
    <View style={styles.fieldContainer}>
      <Text style={[styles.label, { color: theme.subtext }]}>{label}</Text>
      <View style={styles.passwordRow}>
        <TextInput
          style={[
            styles.input,
            styles.passwordInput,
            { backgroundColor: theme.inputBg, color: theme.text, borderColor: theme.border },
            focused && { borderColor: theme.accent },
            err && { borderColor: theme.danger },
          ]}
          placeholder={placeholder ?? ''}
          placeholderTextColor={theme.subtext + 'AA'}
          value={value}
          onChangeText={nextValue => {
            onChange(nextValue);
            if (errorKey) setErrors(e => ({ ...e, [errorKey]: '' }));
          }}
          secureTextEntry={!showPassword}
          autoCapitalize="none"
          autoCorrect={false}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
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
      {err ? <Text style={[styles.errorText, { color: theme.danger }]}>{err}</Text> : null}
    </View>
  );
};

export default function RegisterScreen() {
  const navigation = useNavigation<Nav>();
  const { register } = useAuth();
  const { theme } = useTheme();
  const haptics = useHaptics();
  const { t } = useLanguage();

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
  const [showSuccessModal, setShowSuccessModal] = useState(false);

  function validate() {
    const e: Record<string, string> = {};
    if (!name.trim() || name.trim().length < 2) e.name = t('nameMinLength');
    if (!email.trim() || !/\S+@\S+\.\S+/.test(email)) e.email = t('invalidEmail');
    if (!password || password.length < 6) e.password = t('passwordMinLength');
    if (password !== confirmPassword) e.confirmPassword = t('passwordsDoNotMatch');
    if (birthYear) {
      const year = parseInt(birthYear, 10);
      if (isNaN(year) || year < 1920 || year > CURRENT_YEAR - 13) e.birthYear = t('invalidBirthYear');
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
      setShowSuccessModal(true);
    } catch (err: any) {
      haptics.error();
      setErrors({ email: err.message });
    } finally {
      setLoading(false);
    }
  }

  const genderLabel = (key: string) => t(key);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <Text style={[styles.title, { color: theme.text }]}>{t('registerButton')}</Text>
            <Text style={[styles.subtitle, { color: theme.subtext }]}>{t('registerTitle')}</Text>
          </View>

          <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.label, { color: theme.subtext, marginTop: 4 }]}>{t('avatarTitle')}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.avatarScroll}>
              <View style={styles.avatarRow}>
                {AVATARS.map((emoji, i) => (
                  <TouchableOpacity
                    key={i}
                    style={[
                      styles.avatarBtn,
                      { backgroundColor: theme.inputBg },
                      avatarIndex === i && [styles.avatarBtnActive, { borderColor: theme.accent }],
                    ]}
                    onPress={() => { setAvatarIndex(i); haptics.light(); }}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.avatarEmoji}>{emoji}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            <FormField
              label={`${t('namePlaceholder')} *`}
              value={name}
              onChange={setName}
              placeholder={t('namePlaceholderPrompt')}
              errorKey="name"
              errors={errors}
              setErrors={setErrors}
              theme={theme}
            />

            <FormField
              label="Email *"
              value={email}
              onChange={setEmail}
              placeholder="your@email.com"
              errorKey="email"
              keyboard="email-address"
              errors={errors}
              setErrors={setErrors}
              theme={theme}
            />

            <PasswordField
              label={`${t('passwordPlaceholder')} *`}
              value={password}
              onChange={setPassword}
              placeholder={t('passwordPlaceholderMin')}
              errorKey="password"
              showPassword={showPassword}
              setShowPassword={setShowPassword}
              errors={errors}
              setErrors={setErrors}
              theme={theme}
            />

            <PasswordField
              label={`${t('confirmPassword')} *`}
              value={confirmPassword}
              onChange={setConfirmPassword}
              placeholder="********"
              errorKey="confirmPassword"
              showPassword={showPassword}
              setShowPassword={setShowPassword}
              errors={errors}
              setErrors={setErrors}
              theme={theme}
            />

            <Text style={[styles.label, { color: theme.subtext }]}>{t('genderLabel')}</Text>
            <View style={styles.genderRow}>
              {GENDER_OPTIONS.map(opt => (
                <TouchableOpacity
                  key={opt.key}
                  style={[
                    styles.genderBtn,
                    { backgroundColor: theme.inputBg, borderColor: theme.border },
                    gender === opt.key && [styles.genderBtnActive, { borderColor: theme.accent, backgroundColor: theme.accentLight }],
                  ]}
                  onPress={() => { setGender(opt.key); haptics.light(); }}
                  activeOpacity={0.8}
                >
                  <Text style={styles.genderEmoji}>{opt.emoji}</Text>
                  <Text
                    style={[
                      styles.genderLabel,
                      { color: theme.subtext },
                      gender === opt.key && [styles.genderLabelActive, { color: theme.accentText }],
                    ]}
                  >
                    {genderLabel(opt.labelKey)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <FormField
              label={t('birthYear')}
              value={birthYear}
              onChange={setBirthYear}
              placeholder={t('birthYearExample')}
              errorKey="birthYear"
              keyboard="number-pad"
              errors={errors}
              setErrors={setErrors}
              theme={theme}
            />

            <FormField
              label={t('bioPlaceholder')}
              value={bio}
              onChange={setBio}
              placeholder={t('bioPlaceholderPrompt')}
              errors={errors}
              setErrors={setErrors}
              theme={theme}
            />

            <View style={[styles.previewRow, { backgroundColor: theme.inputBg }]}>
              <View style={[styles.previewAvatar, { backgroundColor: theme.accentLight }]}>
                <Text style={{ fontSize: 28 }}>{AVATARS[avatarIndex]}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.previewName, { color: theme.text }]}>{name || t('yourName')}</Text>
                <Text style={[styles.previewEmail, { color: theme.subtext }]}>{email || 'email@example.com'}</Text>
                {birthYear ? (
                  <Text style={[styles.previewAge, { color: theme.accent }]}>
                    {CURRENT_YEAR - parseInt(birthYear || '2000', 10)} {t('ageUnit')} ·{' '}
                    {GENDER_OPTIONS.find(item => item.key === gender)?.emoji} {genderLabel(GENDER_OPTIONS.find(item => item.key === gender)?.labelKey ?? 'genderNotSpecified')}
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
              <LinearGradient
                colors={loading ? [theme.accent + '88', theme.accent + '88'] : [theme.accent, '#4F46E5']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.registerGradient}
              >
                <Text style={styles.registerBtnText}>{loading ? t('loading') : t('registerButton')}</Text>
              </LinearGradient>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.loginLink}
              onPress={() => navigation.goBack()}
              activeOpacity={0.7}
            >
              <Text style={[styles.loginLinkText, { color: theme.accent, fontWeight: '700' }]}>
                {t('loginPrompt')}
              </Text>
            </TouchableOpacity>
          </View>
          <View style={{ height: 40 }} />
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
              {t('registerSuccessMessage')}
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
  scroll: { padding: 20, paddingTop: 32 },
  header: {
    width: '100%',
    maxWidth: 600,
    alignSelf: 'center',
    marginBottom: 24,
  },
  title: { fontSize: 28, fontWeight: '900', marginBottom: 6, letterSpacing: -0.5 },
  subtitle: { fontSize: 15, fontWeight: '500' },
  card: {
    borderRadius: 24, padding: 20,
    borderWidth: 1,
    width: '100%', maxWidth: 600, alignSelf: 'center',
    shadowColor: '#0F172A', shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.06, shadowRadius: 24, elevation: 4,
  },
  fieldContainer: {
    width: '100%',
    marginBottom: 4,
  },
  label: {
    fontSize: 12, fontWeight: '700',
    marginBottom: 8, marginTop: 16,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    borderRadius: 16,
    paddingHorizontal: 16, paddingVertical: 13,
    fontSize: 15, borderWidth: 1.5,
    width: '100%',
  },
  errorText: { fontSize: 12, marginTop: 6, fontWeight: '500' },
  avatarScroll: { marginBottom: 8, marginTop: 4 },
  avatarRow: { flexDirection: 'row', gap: 10, paddingVertical: 4 },
  avatarBtn: {
    width: 54, height: 54, borderRadius: 27,
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 2, borderColor: 'transparent',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03, shadowRadius: 4, elevation: 1,
  },
  avatarBtnActive: { borderWidth: 2, transform: [{ scale: 1.05 }] },
  avatarEmoji: { fontSize: 26 },
  passwordRow: { flexDirection: 'row', alignItems: 'center', width: '100%' },
  passwordInput: { borderRadius: 16, flex: 1 },
  eyeBtn: { position: 'absolute', right: 16, padding: 8 },
  eyeText: { fontSize: 13, fontWeight: '700' },
  genderRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
  genderBtn: {
    flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 16,
    borderWidth: 1.5,
  },
  genderBtnActive: { borderWidth: 1.5 },
  genderEmoji: { fontSize: 22, marginBottom: 4 },
  genderLabel: { fontSize: 12, fontWeight: '600', textAlign: 'center' },
  genderLabelActive: { fontWeight: '700' },
  previewRow: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    marginTop: 24, padding: 16, borderRadius: 16,
  },
  previewAvatar: {
    width: 56, height: 56, borderRadius: 28,
    justifyContent: 'center', alignItems: 'center',
  },
  previewName: { fontSize: 16, fontWeight: '800', letterSpacing: -0.2 },
  previewEmail: { fontSize: 13, marginTop: 2, fontWeight: '500' },
  previewAge: { fontSize: 12, marginTop: 4, fontWeight: '700' },
  registerBtn: {
    borderRadius: 16,
    overflow: 'hidden',
    marginTop: 24,
  },
  registerGradient: {
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  registerBtnDisabled: { opacity: 0.6 },
  registerBtnText: { fontSize: 16, fontWeight: '800', color: '#FFF' },
  loginLink: { alignItems: 'center', paddingVertical: 16, marginTop: 4 },
  loginLinkText: { fontSize: 14, fontWeight: '500' },
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

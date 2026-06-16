import React, { useEffect, useState } from 'react';
import { ActivityIndicator, SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { AppRole } from '../types';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { supabase } from '../lib/supabase';
import AvatarImage from '../components/AvatarImage';
import { isSuperAdmin } from '../lib/adminAccess';
import CustomConfirmModal from '../components/CustomConfirmModal';

interface ProfileRow {
  id: string;
  name: string;
  email: string;
  avatar: string;
  role: AppRole;
}

const ROLES: AppRole[] = ['user', 'moderator', 'admin'];

export default function AdminRolesScreen() {
  const { user } = useAuth();
  const { theme, isDark } = useTheme();
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [confirmModal, setConfirmModal] = useState<{
    visible: boolean;
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    isDestructive?: boolean;
    showCancel?: boolean;
    showInput?: boolean;
    inputPlaceholder?: string;
    defaultValue?: string;
    onConfirm: (text?: string) => void;
  } | null>(null);

  const showAlert = (title?: string, message?: string, onConfirm?: () => void) => {
    setConfirmModal({
      visible: true,
      title: title ?? '',
      message: message ?? '',
      confirmText: 'OK',
      showCancel: false,
      onConfirm: () => {
        if (onConfirm) onConfirm();
      },
    });
  };

  const shadowColor = isDark ? '#000' : '#0F172A';
  const shadowOpacity = isDark ? 0.35 : 0.05;

  useEffect(() => {
    loadProfiles();
  }, []);

  async function loadProfiles() {
    if (!isSuperAdmin(user)) {
      setLoading(false);
      return;
    }

    const { data } = await supabase
      .from('profiles')
      .select('id, name, email, avatar, role')
      .order('created_at', { ascending: false });

    setProfiles((data ?? []).map((p: any) => ({
      id: p.id,
      name: p.name ?? 'Пользователь',
      email: p.email ?? '',
      avatar: p.avatar ?? '👤',
      role: p.role ?? 'user',
    })));
    setLoading(false);
  }

  function isProtectedPeerAdmin(profile: ProfileRow) {
    return profile.role === 'admin' && profile.id !== user?.id;
  }

  async function setRole(profile: ProfileRow, role: AppRole) {
    if (isProtectedPeerAdmin(profile)) {
      showAlert('Нельзя менять другого admin', 'Второй admin защищен от изменений через интерфейс.');
      return;
    }

    if (profile.id === user?.id && role !== 'admin') {
      showAlert('Нельзя снять admin с себя', 'Назначьте другого администратора и измените роль через Supabase.');
      return;
    }

    const { error } = await supabase.from('profiles').update({ role }).eq('id', profile.id);
    if (error) {
      showAlert('Не удалось изменить роль', error.message);
      return;
    }

    setProfiles(prev => prev.map(p => p.id === profile.id ? { ...p, role } : p));
  }

  const getRoleColors = (role: AppRole, isActive: boolean) => {
    if (!isActive) {
      return {
        bg: 'transparent',
        border: theme.border,
        text: theme.subtext,
      };
    }
    switch (role) {
      case 'admin':
        return {
          bg: isDark ? 'rgba(16, 185, 129, 0.15)' : '#ECFDF5',
          border: theme.success,
          text: theme.success,
        };
      case 'moderator':
        return {
          bg: isDark ? 'rgba(245, 158, 11, 0.15)' : '#FEF3C7',
          border: theme.warning,
          text: theme.warning,
        };
      case 'user':
      default:
        return {
          bg: theme.accentLight,
          border: theme.accent,
          text: theme.accent,
        };
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]}>
        <ActivityIndicator color={theme.accent} style={{ flex: 1 }} />
      </SafeAreaView>
    );
  }

  if (!isSuperAdmin(user)) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]}>
        <View style={styles.center}>
          <Text style={[styles.empty, { color: theme.text }]}>Нет доступа</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {profiles.map(profile => (
          <View
            key={profile.id}
            style={[
              styles.card,
              {
                backgroundColor: theme.card,
                borderColor: theme.border,
                shadowColor,
                shadowOpacity,
              }
            ]}
          >
            <AvatarImage value={profile.avatar} size={42} backgroundColor={theme.accentLight} textSize={24} />
            <View style={styles.info}>
              <Text style={[styles.name, { color: theme.text }]}>{profile.name}</Text>
              <Text style={[styles.email, { color: theme.subtext }]}>{profile.email || profile.id}</Text>
              {isProtectedPeerAdmin(profile) ? (
                <Text style={[styles.protectedText, { color: theme.warning }]}>Другой admin защищен от изменения роли</Text>
              ) : null}
              <View style={styles.roles}>
                {ROLES.map(role => {
                  const isActive = profile.role === role;
                  const colors = getRoleColors(role, isActive);
                  return (
                    <TouchableOpacity
                      key={role}
                      disabled={isProtectedPeerAdmin(profile) || (profile.id === user?.id && role !== 'admin')}
                      style={[
                        styles.roleBtn,
                        {
                          borderColor: colors.border,
                          backgroundColor: colors.bg,
                          opacity: isProtectedPeerAdmin(profile) || (profile.id === user?.id && role !== 'admin') ? 0.5 : 1,
                        },
                      ]}
                      onPress={() => setRole(profile, role)}
                    >
                      <Text style={[styles.roleText, { color: colors.text }]}>{role}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          </View>
        ))}
      </ScrollView>
      {confirmModal && (
        <CustomConfirmModal
          visible={confirmModal.visible}
          title={confirmModal.title}
          message={confirmModal.message}
          confirmText={confirmModal.confirmText}
          cancelText={confirmModal.cancelText}
          isDestructive={confirmModal.isDestructive}
          showCancel={confirmModal.showCancel}
          showInput={confirmModal.showInput}
          inputPlaceholder={confirmModal.inputPlaceholder}
          defaultValue={confirmModal.defaultValue}
          onConfirm={(text) => {
            confirmModal.onConfirm(text);
            setConfirmModal(null);
          }}
          onCancel={() => setConfirmModal(null)}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { fontSize: 18, fontWeight: '800' },
  content: { padding: 16, paddingBottom: 36, width: '100%', maxWidth: 720, alignSelf: 'center' },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: 16, padding: 16, marginBottom: 12,
    shadowOffset: { width: 0, height: 4 }, shadowRadius: 8, elevation: 1
  },
  info: { flex: 1 },
  name: { fontSize: 16, fontWeight: '800' },
  email: { fontSize: 12, marginTop: 3 },
  protectedText: { fontSize: 12, marginTop: 6, fontWeight: '700' },
  roles: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  roleBtn: { borderWidth: 1, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 },
  roleText: { fontSize: 12, fontWeight: '800' },
});

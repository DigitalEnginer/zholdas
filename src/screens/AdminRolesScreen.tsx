import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { AppRole } from '../types';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { supabase } from '../lib/supabase';
import AvatarImage from '../components/AvatarImage';
import { isSuperAdmin } from '../lib/adminAccess';

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
  const { theme } = useTheme();
  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [loading, setLoading] = useState(true);

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
      Alert.alert('Нельзя менять другого admin', 'Второй admin защищен от изменений через интерфейс.');
      return;
    }

    if (profile.id === user?.id && role !== 'admin') {
      Alert.alert('Нельзя снять admin с себя', 'Назначьте другого администратора и измените роль через Supabase.');
      return;
    }

    const { error } = await supabase.from('profiles').update({ role }).eq('id', profile.id);
    if (error) {
      Alert.alert('Не удалось изменить роль', error.message);
      return;
    }

    setProfiles(prev => prev.map(p => p.id === profile.id ? { ...p, role } : p));
  }

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
          <View key={profile.id} style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <AvatarImage value={profile.avatar} size={42} backgroundColor={theme.accentLight} textSize={24} />
            <View style={styles.info}>
              <Text style={[styles.name, { color: theme.text }]}>{profile.name}</Text>
              <Text style={[styles.email, { color: theme.subtext }]}>{profile.email || profile.id}</Text>
              {isProtectedPeerAdmin(profile) ? (
                <Text style={[styles.protectedText, { color: '#E07B2C' }]}>Другой admin защищен от изменения роли</Text>
              ) : null}
              <View style={styles.roles}>
                {ROLES.map(role => (
                  <TouchableOpacity
                    key={role}
                    disabled={isProtectedPeerAdmin(profile) || (profile.id === user?.id && role !== 'admin')}
                    style={[
                      styles.roleBtn,
                      {
                        borderColor: profile.role === role ? theme.accent : theme.border,
                        backgroundColor: profile.role === role ? theme.accentLight : 'transparent',
                        opacity: isProtectedPeerAdmin(profile) || (profile.id === user?.id && role !== 'admin') ? 0.5 : 1,
                      },
                    ]}
                    onPress={() => setRole(profile, role)}
                  >
                    <Text style={[styles.roleText, { color: profile.role === role ? theme.accent : theme.subtext }]}>{role}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { fontSize: 18, fontWeight: '800' },
  content: { padding: 16, paddingBottom: 36 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: 14, padding: 14, marginBottom: 10 },
  info: { flex: 1 },
  name: { fontSize: 16, fontWeight: '800' },
  email: { fontSize: 12, marginTop: 3 },
  protectedText: { fontSize: 12, marginTop: 6, fontWeight: '700' },
  roles: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  roleBtn: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 6 },
  roleText: { fontSize: 12, fontWeight: '800' },
});

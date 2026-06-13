import React, { useEffect, useState } from 'react';
import { ActivityIndicator, SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { RootStackParamList } from '../types';
import { supabase } from '../lib/supabase';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type NotificationTab = 'all' | 'unread';

interface NotificationItem {
  id: string;
  title: string;
  body: string | null;
  type: string;
  is_read: boolean;
  created_at: string;
}

export default function NotificationsScreen() {
  const { user } = useAuth();
  const { theme, isDark } = useTheme();
  const navigation = useNavigation<Nav>();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<NotificationTab>('all');

  useEffect(() => {
    loadNotifications();
  }, [user?.id]);

  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel(`notifications-screen-${user.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notifications', filter: `recipient_id=eq.${user.id}` },
        loadNotifications
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user?.id]);

  async function loadNotifications() {
    if (!user) return;
    const { data } = await supabase
      .from('notifications')
      .select('id, title, body, type, is_read, created_at')
      .eq('recipient_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50);

    setItems((data ?? []) as NotificationItem[]);
    setLoading(false);
  }

  async function markRead(id: string) {
    await supabase.from('notifications').update({ is_read: true }).eq('id', id);
    setItems(prev => prev.map(item => item.id === id ? { ...item, is_read: true } : item));
  }

  async function handlePress(item: NotificationItem) {
    await markRead(item.id);

    if (item.type === 'friend_request' || item.type === 'friend_accept') {
      navigation.navigate('Friends');
    } else if (item.type === 'report_created') {
      navigation.navigate('ModeratorDashboard');
    } else if (
      item.type === 'event_joined'
      || item.type === 'event_left'
      || item.type === 'event_finished'
      || item.type === 'event_cancelled'
      || item.type === 'chat_message'
      || item.type === 'broadcast'
    ) {
      navigation.navigate('Main');
    }
  }

  async function markAllRead() {
    if (!user) return;
    await supabase.from('notifications').update({ is_read: true }).eq('recipient_id', user.id);
    setItems(prev => prev.map(item => ({ ...item, is_read: true })));
  }

  const shadowColor = isDark ? '#000' : '#0F172A';
  const shadowOpacity = isDark ? 0.35 : 0.04;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]}>
      {loading ? (
        <ActivityIndicator color={theme.accent} style={{ flex: 1 }} />
      ) : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={[styles.tabs, { backgroundColor: theme.inputBg, borderColor: theme.border }]}>
            {[
              { key: 'all', label: `Все (${items.length})` },
              { key: 'unread', label: `Новые (${items.filter(item => !item.is_read).length})` },
            ].map(tab => {
              const selected = activeTab === tab.key;
              return (
                <TouchableOpacity
                  key={tab.key}
                  style={[
                    styles.tab,
                    selected && {
                      backgroundColor: theme.card,
                      borderColor: theme.border,
                      borderWidth: 1,
                      shadowColor,
                      shadowOpacity: 0.08,
                      shadowOffset: { width: 0, height: 2 },
                      shadowRadius: 4,
                    }
                  ]}
                  onPress={() => setActiveTab(tab.key as NotificationTab)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.tabText, { color: selected ? theme.text : theme.subtext, fontWeight: selected ? '800' : '600' }]}>{tab.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          {items.length > 0 && (
            <TouchableOpacity style={[styles.readAll, { borderColor: theme.border, backgroundColor: theme.card }]} onPress={markAllRead}>
              <Text style={[styles.readAllText, { color: theme.accent }]}>Отметить все прочитанными</Text>
            </TouchableOpacity>
          )}
          {(activeTab === 'unread' ? items.filter(item => !item.is_read) : items).length === 0 ? (
            <Text style={[styles.empty, { color: theme.subtext }]}>Уведомлений пока нет</Text>
          ) : (
            (activeTab === 'unread' ? items.filter(item => !item.is_read) : items).map(item => (
              <TouchableOpacity
                key={item.id}
                style={[
                  styles.card,
                  {
                    backgroundColor: theme.card,
                    borderColor: theme.border,
                    shadowColor,
                    shadowOpacity,
                  }
                ]}
                onPress={() => handlePress(item)}
                activeOpacity={0.8}
              >
                <View style={[styles.dot, { backgroundColor: item.is_read ? 'transparent' : theme.accent, borderColor: item.is_read ? 'transparent' : theme.accentLight }]} />
                <View style={styles.body}>
                  <Text style={[styles.title, { color: theme.text, fontWeight: item.is_read ? '600' : '800' }]}>{item.title}</Text>
                  {item.body ? <Text style={[styles.text, { color: theme.subtext }]}>{item.body}</Text> : null}
                </View>
              </TouchableOpacity>
            ))
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 36, width: '100%', maxWidth: 820, alignSelf: 'center' },
  tabs: { flexDirection: 'row', gap: 4, borderRadius: 16, padding: 4, marginBottom: 16, borderWidth: 1 },
  tab: { flex: 1, borderRadius: 12, paddingVertical: 10, alignItems: 'center', justifyContent: 'center' },
  tabText: { fontSize: 12 },
  readAll: { borderWidth: 1, borderRadius: 14, padding: 12, alignItems: 'center', marginBottom: 16, shadowColor: '#101828', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.02, shadowRadius: 4, elevation: 1 },
  readAllText: { fontSize: 13, fontWeight: '700' },
  empty: { marginTop: 40, textAlign: 'center', fontSize: 15 },
  card: {
    flexDirection: 'row', borderWidth: 1, borderRadius: 16, padding: 14, marginBottom: 10,
    shadowOffset: { width: 0, height: 4 }, shadowRadius: 12, elevation: 2,
    alignItems: 'center',
  },
  dot: { width: 8, height: 8, borderRadius: 4, marginRight: 12, borderWidth: 1 },
  body: { flex: 1 },
  title: { fontSize: 14 },
  text: { fontSize: 13, lineHeight: 18, marginTop: 4 },
});

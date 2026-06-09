import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator, Alert, Image, RefreshControl, SafeAreaView, ScrollView,
  StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { supabase } from '../lib/supabase';
import AvatarImage from '../components/AvatarImage';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type ReportStatus = 'pending' | 'reviewed' | 'dismissed';
type DashboardTab = 'reports' | 'bans' | 'history';

interface ReportItem {
  id: string;
  reporter_id: string;
  reported_user_id: string;
  reason: string;
  details: string | null;
  status: ReportStatus;
  created_at: string;
}

interface BanItem {
  user_id: string;
  banned_by: string;
  reason: string | null;
  created_at: string;
}

interface ModerationAction {
  id: string;
  moderator_id: string | null;
  target_user_id: string;
  action: 'ban' | 'unban' | 'report_reviewed' | 'report_dismissed';
  reason: string | null;
  created_at: string;
}

interface ProfileSummary {
  id: string;
  name: string;
  avatar: string;
  role?: string;
  is_banned?: boolean;
}

function formatDate(value: string) {
  return new Date(value).toLocaleString('ru-RU', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getDetailValue(details: string | null, key: string) {
  if (!details) return null;
  const line = details.split('\n').find(item => item.startsWith(`${key}:`));
  return line ? line.slice(key.length + 1).trim() : null;
}

function isMessageReport(report: ReportItem) {
  return getDetailValue(report.details, 'type') === 'message' || report.reason.toLowerCase().includes('сообщ');
}

export default function ModeratorDashboardScreen() {
  const navigation = useNavigation<Nav>();
  const { user } = useAuth();
  const { theme } = useTheme();
  const [reports, setReports] = useState<ReportItem[]>([]);
  const [bans, setBans] = useState<BanItem[]>([]);
  const [actions, setActions] = useState<ModerationAction[]>([]);
  const [profiles, setProfiles] = useState<Record<string, ProfileSummary>>({});
  const [activeTab, setActiveTab] = useState<DashboardTab>('reports');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const canModerate = user?.role === 'moderator' || user?.role === 'admin';

  useEffect(() => {
    loadModerationData();
  }, []);

  const bannedIds = useMemo(() => new Set(bans.map(b => b.user_id)), [bans]);
  const pendingReports = reports.filter(r => r.status === 'pending');

  async function loadModerationData() {
    if (!canModerate) {
      setLoading(false);
      return;
    }

    const [{ data: reportsData }, { data: bansData }, { data: actionsData }] = await Promise.all([
      supabase
        .from('reports')
        .select('id, reporter_id, reported_user_id, reason, details, status, created_at')
        .order('created_at', { ascending: false }),
      supabase
        .from('user_bans')
        .select('user_id, banned_by, reason, created_at')
        .order('created_at', { ascending: false }),
      supabase
        .from('moderation_actions')
        .select('id, moderator_id, target_user_id, action, reason, created_at')
        .order('created_at', { ascending: false })
        .limit(40),
    ]);

    const nextReports = (reportsData ?? []) as ReportItem[];
    const nextBans = (bansData ?? []) as BanItem[];
    const nextActions = (actionsData ?? []) as ModerationAction[];
    const ids = Array.from(new Set([
      ...nextReports.flatMap(r => [r.reporter_id, r.reported_user_id]),
      ...nextBans.flatMap(b => [b.user_id, b.banned_by]),
      ...nextActions.flatMap(a => [a.moderator_id, a.target_user_id].filter(Boolean) as string[]),
    ]));

    if (ids.length > 0) {
      const { data: profilesData } = await supabase
        .from('profiles')
        .select('id, name, avatar, role, is_banned')
        .in('id', ids);

      const profileMap: Record<string, ProfileSummary> = {};
      (profilesData ?? []).forEach((p: any) => {
        profileMap[p.id] = {
          id: p.id,
          name: p.name ?? 'Пользователь',
          avatar: p.avatar ?? '👤',
          role: p.role,
          is_banned: p.is_banned,
        };
      });
      setProfiles(profileMap);
    } else {
      setProfiles({});
    }

    setReports(nextReports);
    setBans(nextBans);
    setActions(nextActions);
    setLoading(false);
  }

  async function refresh() {
    setRefreshing(true);
    await loadModerationData();
    setRefreshing(false);
  }

  async function updateReportStatus(reportId: string, status: ReportStatus) {
    const { error } = await supabase.from('reports').update({ status }).eq('id', reportId);
    if (error) {
      Alert.alert('Ошибка', error.message);
      return;
    }
    setReports(prev => prev.map(r => r.id === reportId ? { ...r, status } : r));
  }

  function openProfile(profile?: ProfileSummary) {
    if (!profile) return;
    navigation.navigate('UserProfile', { userId: profile.id, userName: profile.name, userAvatar: profile.avatar });
  }

  async function banFromReport(report: ReportItem) {
    if (!user) return;

    if (bannedIds.has(report.reported_user_id)) {
      Alert.alert('Уже забанен', 'Этот пользователь уже находится в бане.');
      return;
    }

    Alert.alert('Забанить пользователя?', report.reason, [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Забанить',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.from('user_bans').insert({
            user_id: report.reported_user_id,
            banned_by: user.id,
            reason: `Жалоба: ${report.reason}`,
          });

          if (error) {
            Alert.alert('Не удалось забанить', error.message);
            return;
          }

          await updateReportStatus(report.id, 'reviewed');
          await loadModerationData();
        },
      },
    ]);
  }

  async function unbanUser(userId: string) {
    const { error } = await supabase.from('user_bans').delete().eq('user_id', userId);
    if (error) {
      Alert.alert('Не удалось разбанить', error.message);
      return;
    }
    await loadModerationData();
  }

  function deleteReportedMessage(report: ReportItem) {
    const messageId = getDetailValue(report.details, 'message_id');
    if (!messageId) {
      Alert.alert('Нет id сообщения', 'Эта жалоба была создана до сохранения message_id.');
      return;
    }

    Alert.alert('Удалить сообщение?', 'Сообщение пропадет из чата у участников.', [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Удалить',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.from('messages').delete().eq('id', messageId);
          if (error) {
            Alert.alert('Не удалось удалить', error.message);
            return;
          }
          await updateReportStatus(report.id, 'reviewed');
        },
      },
    ]);
  }

  if (!canModerate) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]}>
        <View style={styles.center}>
          <Text style={[styles.emptyTitle, { color: theme.text }]}>Нет доступа</Text>
          <Text style={[styles.emptyText, { color: theme.subtext }]}>Этот раздел доступен только модераторам и админам.</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]}>
        <ActivityIndicator color={theme.accent} style={{ flex: 1 }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={theme.accent} />}
      >
        <View style={[styles.summary, { backgroundColor: theme.card }]}>
          <View style={styles.summaryItem}>
            <Text style={[styles.summaryValue, { color: '#D92D20' }]}>{pendingReports.length}</Text>
            <Text style={[styles.summaryLabel, { color: theme.subtext }]}>новых жалоб</Text>
          </View>
          <View style={[styles.summaryItem, { borderLeftColor: theme.border, borderLeftWidth: 1 }]}>
            <Text style={[styles.summaryValue, { color: theme.accent }]}>{reports.length}</Text>
            <Text style={[styles.summaryLabel, { color: theme.subtext }]}>всего</Text>
          </View>
          <View style={[styles.summaryItem, { borderLeftColor: theme.border, borderLeftWidth: 1 }]}>
            <Text style={[styles.summaryValue, { color: '#E07B2C' }]}>{bans.length}</Text>
            <Text style={[styles.summaryLabel, { color: theme.subtext }]}>банов</Text>
          </View>
        </View>

        <View style={[styles.tabs, { backgroundColor: theme.card }]}>
          {[
            { key: 'reports', label: 'Жалобы' },
            { key: 'bans', label: 'Баны' },
            { key: 'history', label: 'История' },
          ].map(tab => {
            const selected = activeTab === tab.key;
            return (
              <TouchableOpacity
                key={tab.key}
                style={[styles.tab, selected && { backgroundColor: theme.accent }]}
                onPress={() => setActiveTab(tab.key as DashboardTab)}
                activeOpacity={0.75}
              >
                <Text style={[styles.tabText, { color: selected ? '#FFF' : theme.subtext }]}>{tab.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {activeTab === 'reports' && (
          <View style={[styles.section, { backgroundColor: theme.card }]}>
            <Text style={[styles.sectionTitle, { color: theme.subtext }]}>Очередь жалоб</Text>
            {reports.length === 0 ? (
              <Text style={[styles.emptyText, { color: theme.subtext }]}>Жалоб пока нет</Text>
            ) : (
              reports.map(report => {
                const reporter = profiles[report.reporter_id];
                const target = profiles[report.reported_user_id];
                const isPending = report.status === 'pending';
                const messageText = getDetailValue(report.details, 'message_text');
                const imageUrl = getDetailValue(report.details, 'image_url');
                const eventTitle = getDetailValue(report.details, 'event_title');

                return (
                  <View key={report.id} style={[styles.reportCard, { borderTopColor: theme.border }]}>
                    <View style={styles.reportHeader}>
                      <TouchableOpacity style={styles.person} onPress={() => openProfile(target)} activeOpacity={0.75}>
                        <AvatarImage value={target?.avatar ?? '👤'} size={42} backgroundColor={theme.accentLight} textSize={24} />
                        <View style={styles.personBody}>
                          <Text style={[styles.rowTitle, { color: theme.text }]}>{target?.name ?? 'Пользователь'}</Text>
                          <Text style={[styles.rowMeta, { color: theme.subtext }]}>На кого жалоба</Text>
                        </View>
                      </TouchableOpacity>
                      <View style={[styles.statusPill, { backgroundColor: isPending ? '#FEE4E2' : theme.accentLight }]}>
                        <Text style={[styles.statusText, { color: isPending ? '#D92D20' : theme.accent }]}>
                          {isPending ? 'Новая' : report.status === 'reviewed' ? 'Закрыта' : 'Отклонена'}
                        </Text>
                      </View>
                    </View>

                    <Text style={[styles.reason, { color: theme.text }]}>{report.reason}</Text>
                    {messageText ? (
                      <View style={[styles.detailBox, { backgroundColor: theme.bg, borderColor: theme.border }]}>
                        <Text style={[styles.detailLabel, { color: theme.subtext }]}>Сообщение</Text>
                        <Text style={[styles.detailText, { color: theme.text }]}>{messageText}</Text>
                      </View>
                    ) : report.details ? (
                      <Text style={[styles.details, { color: theme.subtext }]}>{report.details}</Text>
                    ) : null}
                    {imageUrl ? (
                      <Image source={{ uri: imageUrl }} style={styles.reportImage} />
                    ) : null}

                    <View style={styles.metaRow}>
                      <Text style={[styles.rowMeta, { color: theme.subtext }]}>От: {reporter?.name ?? 'пользователь'}</Text>
                      <Text style={[styles.rowMeta, { color: theme.subtext }]}>{formatDate(report.created_at)}</Text>
                    </View>
                    {eventTitle ? <Text style={[styles.rowMeta, { color: theme.subtext }]}>Ивент: {eventTitle}</Text> : null}

                    <View style={styles.actions}>
                      <TouchableOpacity style={[styles.actionBtn, { backgroundColor: theme.accent }]} onPress={() => openProfile(target)}>
                        <Text style={styles.actionText}>Профиль</Text>
                      </TouchableOpacity>
                      {isPending && (
                        <>
                          <TouchableOpacity
                            style={[styles.actionBtn, { backgroundColor: bannedIds.has(report.reported_user_id) ? theme.subtext : '#D92D20' }]}
                            onPress={() => banFromReport(report)}
                            disabled={bannedIds.has(report.reported_user_id)}
                          >
                            <Text style={styles.actionText}>{bannedIds.has(report.reported_user_id) ? 'Уже бан' : 'Бан'}</Text>
                          </TouchableOpacity>
                          {isMessageReport(report) && (
                            <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#E07B2C' }]} onPress={() => deleteReportedMessage(report)}>
                              <Text style={styles.actionText}>Удалить</Text>
                            </TouchableOpacity>
                          )}
                          <TouchableOpacity style={[styles.actionBtn, { backgroundColor: theme.accent }]} onPress={() => updateReportStatus(report.id, 'reviewed')}>
                            <Text style={styles.actionText}>Закрыть</Text>
                          </TouchableOpacity>
                          <TouchableOpacity style={[styles.actionBtn, { backgroundColor: theme.subtext }]} onPress={() => updateReportStatus(report.id, 'dismissed')}>
                            <Text style={styles.actionText}>Отклонить</Text>
                          </TouchableOpacity>
                        </>
                      )}
                    </View>
                  </View>
                );
              })
            )}
          </View>
        )}

        {activeTab === 'bans' && (
          <View style={[styles.section, { backgroundColor: theme.card }]}>
            <Text style={[styles.sectionTitle, { color: theme.subtext }]}>Забаненные пользователи</Text>
            {bans.length === 0 ? (
              <Text style={[styles.emptyText, { color: theme.subtext }]}>Активных банов нет</Text>
            ) : (
              bans.map(ban => {
                const banned = profiles[ban.user_id];
                return (
                  <View key={ban.user_id} style={[styles.cardRow, { borderTopColor: theme.border }]}>
                    <TouchableOpacity style={styles.person} onPress={() => openProfile(banned)} activeOpacity={0.75}>
                      <AvatarImage value={banned?.avatar ?? '👤'} size={42} backgroundColor={theme.accentLight} textSize={24} />
                      <View style={styles.personBody}>
                        <Text style={[styles.rowTitle, { color: theme.text }]}>{banned?.name ?? 'Пользователь'}</Text>
                        <Text style={[styles.reason, { color: theme.subtext }]}>{ban.reason ?? 'Без причины'}</Text>
                        <Text style={[styles.rowMeta, { color: theme.subtext }]}>{formatDate(ban.created_at)}</Text>
                      </View>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.outlineBtn, { borderColor: theme.border }]} onPress={() => unbanUser(ban.user_id)}>
                      <Text style={[styles.outlineText, { color: theme.subtext }]}>Разбанить</Text>
                    </TouchableOpacity>
                  </View>
                );
              })
            )}
          </View>
        )}

        {activeTab === 'history' && (
          <View style={[styles.section, { backgroundColor: theme.card }]}>
            <Text style={[styles.sectionTitle, { color: theme.subtext }]}>История действий</Text>
            {actions.length === 0 ? (
              <Text style={[styles.emptyText, { color: theme.subtext }]}>Действий пока нет</Text>
            ) : (
              actions.map(action => {
                const moderator = action.moderator_id ? profiles[action.moderator_id] : null;
                const target = profiles[action.target_user_id];
                const labels: Record<ModerationAction['action'], string> = {
                  ban: 'Бан',
                  unban: 'Разбан',
                  report_reviewed: 'Жалоба закрыта',
                  report_dismissed: 'Жалоба отклонена',
                };

                return (
                  <View key={action.id} style={[styles.cardRow, { borderTopColor: theme.border }]}>
                    <AvatarImage value={target?.avatar ?? '👤'} size={42} backgroundColor={theme.accentLight} textSize={24} />
                    <View style={styles.rowBody}>
                      <Text style={[styles.rowTitle, { color: theme.text }]}>
                        {labels[action.action]}: {target?.name ?? 'Пользователь'}
                      </Text>
                      <Text style={[styles.rowMeta, { color: theme.subtext }]}>Модератор: {moderator?.name ?? 'система'}</Text>
                      <Text style={[styles.rowMeta, { color: theme.subtext }]}>{formatDate(action.created_at)}</Text>
                      {action.reason ? <Text style={[styles.reason, { color: theme.subtext }]}>{action.reason}</Text> : null}
                    </View>
                  </View>
                );
              })
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 36 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  emptyTitle: { fontSize: 18, fontWeight: '800', marginBottom: 8 },
  summary: { flexDirection: 'row', borderRadius: 16, overflow: 'hidden', marginBottom: 12 },
  summaryItem: { flex: 1, alignItems: 'center', paddingVertical: 18 },
  summaryValue: { fontSize: 26, fontWeight: '900' },
  summaryLabel: { fontSize: 12, marginTop: 4 },
  tabs: { flexDirection: 'row', gap: 6, borderRadius: 16, padding: 6, marginBottom: 12 },
  tab: { flex: 1, borderRadius: 12, paddingVertical: 10, alignItems: 'center' },
  tabText: { fontSize: 13, fontWeight: '800' },
  section: { borderRadius: 16, overflow: 'hidden', marginBottom: 12 },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 8,
  },
  emptyText: { paddingHorizontal: 16, paddingBottom: 16, fontSize: 14, textAlign: 'center' },
  reportCard: { padding: 16, borderTopWidth: 1 },
  reportHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  cardRow: { flexDirection: 'row', gap: 12, padding: 16, borderTopWidth: 1, alignItems: 'center' },
  person: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  personBody: { flex: 1 },
  rowBody: { flex: 1 },
  rowTitle: { fontSize: 16, fontWeight: '800' },
  rowMeta: { fontSize: 12, marginTop: 2 },
  reason: { fontSize: 14, lineHeight: 19, marginTop: 8 },
  details: { fontSize: 13, lineHeight: 18, marginTop: 8 },
  detailBox: { borderWidth: 1, borderRadius: 12, padding: 12, marginTop: 10 },
  detailLabel: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase', marginBottom: 4 },
  detailText: { fontSize: 14, lineHeight: 19 },
  reportImage: { width: '100%', height: 180, borderRadius: 12, marginTop: 10, backgroundColor: '#EEE' },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, marginTop: 10 },
  statusPill: { borderRadius: 12, paddingHorizontal: 10, paddingVertical: 6 },
  statusText: { fontSize: 11, fontWeight: '900' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  actionBtn: { borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8 },
  actionText: { color: '#FFF', fontSize: 12, fontWeight: '800' },
  outlineBtn: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8 },
  outlineText: { fontSize: 12, fontWeight: '800' },
});

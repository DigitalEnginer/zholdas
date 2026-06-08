import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, SafeAreaView, ScrollView,
  StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { supabase } from '../lib/supabase';

type ReportStatus = 'pending' | 'reviewed' | 'dismissed';

interface ReportItem {
  id: string;
  reporter_id: string;
  reported_user_id: string;
  reason: string;
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
}

export default function ModeratorDashboardScreen() {
  const { user } = useAuth();
  const { theme } = useTheme();
  const [reports, setReports] = useState<ReportItem[]>([]);
  const [bans, setBans] = useState<BanItem[]>([]);
  const [actions, setActions] = useState<ModerationAction[]>([]);
  const [profiles, setProfiles] = useState<Record<string, ProfileSummary>>({});
  const [loading, setLoading] = useState(true);
  const canModerate = user?.role === 'moderator' || user?.role === 'admin';

  useEffect(() => {
    loadModerationData();
  }, []);

  async function loadModerationData() {
    if (!canModerate) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const [{ data: reportsData }, { data: bansData }, { data: actionsData }] = await Promise.all([
      supabase
        .from('reports')
        .select('id, reporter_id, reported_user_id, reason, status, created_at')
        .order('created_at', { ascending: false }),
      supabase
        .from('user_bans')
        .select('user_id, banned_by, reason, created_at')
        .order('created_at', { ascending: false }),
      supabase
        .from('moderation_actions')
        .select('id, moderator_id, target_user_id, action, reason, created_at')
        .order('created_at', { ascending: false })
        .limit(30),
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
        .select('id, name, avatar')
        .in('id', ids);

      const profileMap: Record<string, ProfileSummary> = {};
      (profilesData ?? []).forEach((p: any) => {
        profileMap[p.id] = {
          id: p.id,
          name: p.name ?? 'Пользователь',
          avatar: p.avatar ?? '👤',
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

  async function updateReportStatus(reportId: string, status: ReportStatus) {
    const { error } = await supabase.from('reports').update({ status }).eq('id', reportId);
    if (error) {
      Alert.alert('Ошибка', error.message);
      return;
    }
    setReports(prev => prev.map(r => r.id === reportId ? { ...r, status } : r));
  }

  async function banFromReport(report: ReportItem) {
    if (!user) return;

    Alert.alert('Забанить по жалобе?', report.reason, [
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
          loadModerationData();
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
    setBans(prev => prev.filter(b => b.user_id !== userId));
  }

  if (!canModerate) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]}>
        <View style={styles.center}>
          <Text style={[styles.emptyTitle, { color: theme.text }]}>Нет доступа</Text>
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

  const pendingReports = reports.filter(r => r.status === 'pending');

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <View style={[styles.summary, { backgroundColor: theme.card }]}>
          <View style={styles.summaryItem}>
            <Text style={[styles.summaryValue, { color: theme.accent }]}>{pendingReports.length}</Text>
            <Text style={[styles.summaryLabel, { color: theme.subtext }]}>новых жалоб</Text>
          </View>
          <View style={[styles.summaryItem, { borderLeftColor: theme.border, borderLeftWidth: 1 }]}>
            <Text style={[styles.summaryValue, { color: '#D92D20' }]}>{bans.length}</Text>
            <Text style={[styles.summaryLabel, { color: theme.subtext }]}>банов</Text>
          </View>
        </View>

        <View style={[styles.section, { backgroundColor: theme.card }]}>
          <Text style={[styles.sectionTitle, { color: theme.subtext }]}>Жалобы</Text>
          {reports.length === 0 ? (
            <Text style={[styles.emptyText, { color: theme.subtext }]}>Жалоб пока нет</Text>
          ) : (
            reports.map(report => {
              const reporter = profiles[report.reporter_id];
              const target = profiles[report.reported_user_id];
              const isPending = report.status === 'pending';

              return (
                <View key={report.id} style={[styles.cardRow, { borderTopColor: theme.border }]}>
                  <Text style={styles.avatar}>{target?.avatar ?? '👤'}</Text>
                  <View style={styles.rowBody}>
                    <Text style={[styles.rowTitle, { color: theme.text }]}>
                      {target?.name ?? 'Пользователь'}
                    </Text>
                    <Text style={[styles.rowMeta, { color: theme.subtext }]}>
                      Жалоба от {reporter?.name ?? 'пользователя'}
                    </Text>
                    <Text style={[styles.reason, { color: theme.text }]}>{report.reason}</Text>
                    <Text style={[styles.status, { color: isPending ? '#D92D20' : theme.subtext }]}>
                      {isPending ? 'На рассмотрении' : report.status === 'reviewed' ? 'Рассмотрено' : 'Отклонено'}
                    </Text>
                    {isPending && (
                      <View style={styles.actions}>
                        <TouchableOpacity style={[styles.actionBtn, { backgroundColor: '#D92D20' }]} onPress={() => banFromReport(report)}>
                          <Text style={styles.actionText}>Бан</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={[styles.actionBtn, { backgroundColor: theme.accent }]} onPress={() => updateReportStatus(report.id, 'reviewed')}>
                          <Text style={styles.actionText}>Закрыть</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={[styles.actionBtn, { backgroundColor: theme.subtext }]} onPress={() => updateReportStatus(report.id, 'dismissed')}>
                          <Text style={styles.actionText}>Отклонить</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                </View>
              );
            })
          )}
        </View>

        <View style={[styles.section, { backgroundColor: theme.card }]}>
          <Text style={[styles.sectionTitle, { color: theme.subtext }]}>Забаненные</Text>
          {bans.length === 0 ? (
            <Text style={[styles.emptyText, { color: theme.subtext }]}>Активных банов нет</Text>
          ) : (
            bans.map(ban => {
              const banned = profiles[ban.user_id];
              return (
                <View key={ban.user_id} style={[styles.cardRow, { borderTopColor: theme.border }]}>
                  <Text style={styles.avatar}>{banned?.avatar ?? '👤'}</Text>
                  <View style={styles.rowBody}>
                    <Text style={[styles.rowTitle, { color: theme.text }]}>{banned?.name ?? 'Пользователь'}</Text>
                    <Text style={[styles.reason, { color: theme.subtext }]}>{ban.reason ?? 'Без причины'}</Text>
                    <TouchableOpacity style={[styles.unbanBtn, { borderColor: theme.border }]} onPress={() => unbanUser(ban.user_id)}>
                      <Text style={[styles.unbanText, { color: theme.subtext }]}>Разбанить</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })
          )}
        </View>

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
                  <Text style={styles.avatar}>{target?.avatar ?? '👤'}</Text>
                  <View style={styles.rowBody}>
                    <Text style={[styles.rowTitle, { color: theme.text }]}>
                      {labels[action.action]}: {target?.name ?? 'Пользователь'}
                    </Text>
                    <Text style={[styles.rowMeta, { color: theme.subtext }]}>
                      Модератор: {moderator?.name ?? 'система'}
                    </Text>
                    {action.reason ? (
                      <Text style={[styles.reason, { color: theme.subtext }]}>{action.reason}</Text>
                    ) : null}
                  </View>
                </View>
              );
            })
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 36 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontSize: 18, fontWeight: '800' },
  summary: {
    flexDirection: 'row',
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 12,
  },
  summaryItem: { flex: 1, alignItems: 'center', paddingVertical: 18 },
  summaryValue: { fontSize: 26, fontWeight: '900' },
  summaryLabel: { fontSize: 12, marginTop: 4 },
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
  emptyText: { paddingHorizontal: 16, paddingBottom: 16, fontSize: 14 },
  cardRow: { flexDirection: 'row', gap: 12, padding: 16, borderTopWidth: 1 },
  avatar: { fontSize: 28 },
  rowBody: { flex: 1 },
  rowTitle: { fontSize: 16, fontWeight: '800' },
  rowMeta: { fontSize: 12, marginTop: 2 },
  reason: { fontSize: 14, lineHeight: 19, marginTop: 8 },
  status: { fontSize: 12, fontWeight: '700', marginTop: 8 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  actionBtn: { borderRadius: 14, paddingHorizontal: 12, paddingVertical: 7 },
  actionText: { color: '#FFF', fontSize: 12, fontWeight: '800' },
  unbanBtn: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 7,
    marginTop: 10,
  },
  unbanText: { fontSize: 12, fontWeight: '800' },
});

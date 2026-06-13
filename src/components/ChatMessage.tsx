import React, { useState } from 'react';
import { Image, View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Message } from '../types';
import { useTheme } from '../context/ThemeContext';
import { useLanguage } from '../context/LanguageContext';
import { useHaptics } from '../hooks/useHaptics';

interface Props {
  message: Message;
  isOwn: boolean;
  onAvatarPress?: () => void;
  onReport?: () => void;
  onDelete?: () => void;
}

const REACTION_EMOJIS = ['❤️', '😂', '👍', '🔥', '👏'];

function formatTime(date: Date): string {
  return new Date(date).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

export default function ChatMessage({ message, isOwn, onAvatarPress, onReport, onDelete }: Props) {
  const { theme, isDark } = useTheme();
  const haptics = useHaptics();
  const { t } = useLanguage();
  const [reactions, setReactions] = useState<Record<string, number>>(
    Object.fromEntries(Object.entries(message.reactions ?? {}).map(([k, v]) => [k, v.length]))
  );
  const [showPicker, setShowPicker] = useState(false);
  const hasActions = !!onReport || !!onDelete;

  function addReaction(emoji: string) {
    haptics.light();
    setReactions(prev => ({ ...prev, [emoji]: (prev[emoji] ?? 0) + 1 }));
    setShowPicker(false);
  }

  const hasReactions = Object.values(reactions).some(v => v > 0);

  if (message.isAI) {
    return (
      <View style={styles.aiWrapper}>
        <LinearGradient
          colors={['#2563EB', '#7C3AED', '#DB2777']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.aiGradientBorder}
        >
          <View style={[styles.aiMessage, { backgroundColor: theme.card }]}>
            <View style={styles.aiHeader}>
              <View style={[styles.aiBadge, { backgroundColor: theme.accentLight }]}>
                <Text style={[styles.aiBadgeText, { color: theme.accent }]}>ZHOLDAS AI</Text>
              </View>
              <Text style={[styles.aiTime, { color: theme.subtext }]}>{formatTime(message.timestamp)}</Text>
            </View>
            <Text style={[styles.aiText, { color: theme.text }]}>{message.text}</Text>
          </View>
        </LinearGradient>
      </View>
    );
  }

  return (
    <View style={[styles.wrapper, isOwn && styles.wrapperOwn]}>
      {!isOwn && (
        <TouchableOpacity style={[styles.avatar, { backgroundColor: theme.accentLight }]} onPress={onAvatarPress}>
          <Text style={[styles.avatarText, { color: theme.accent }]}>
            {message.userName[0].toUpperCase()}
          </Text>
        </TouchableOpacity>
      )}
      <View style={{ maxWidth: '72%' }}>
        <TouchableOpacity
          activeOpacity={0.85}
          onLongPress={() => { haptics.medium(); setShowPicker(v => !v); }}
        >
          <View
            style={[
              styles.bubble,
              isOwn
                ? [styles.bubbleOwn, { backgroundColor: theme.accent }]
                : [
                    styles.bubbleOther,
                    {
                      backgroundColor: theme.card,
                      borderColor: theme.border,
                      shadowColor: isDark ? '#000' : '#0F172A',
                      shadowOpacity: isDark ? 0.35 : 0.04,
                    }
                  ]
            ]}
          >
            {!isOwn && (
              <Text style={[styles.userName, { color: theme.accent }]}>{message.userName}</Text>
            )}
            {message.imageUri ? (
              <Image source={{ uri: message.imageUri }} style={styles.messageImage} />
            ) : null}
            {message.text ? (
              <Text style={[styles.text, { color: isOwn ? '#FFF' : theme.text }]}>{message.text}</Text>
            ) : null}
            <Text style={[styles.time, { color: isOwn ? 'rgba(255,255,255,0.6)' : theme.subtext }]}>
              {formatTime(message.timestamp)}
            </Text>
          </View>
        </TouchableOpacity>

        {showPicker && (
          <View
            style={[
              styles.actionPanel,
              {
                backgroundColor: theme.card,
                borderColor: theme.border,
                shadowColor: isDark ? '#000' : '#0F172A',
                shadowOpacity: isDark ? 0.4 : 0.05,
              },
              isOwn && styles.actionPanelOwn
            ]}
          >
            <View style={styles.reactionPicker}>
              {REACTION_EMOJIS.map(e => (
                <TouchableOpacity key={e} onPress={() => addReaction(e)} style={styles.reactionOption}>
                  <Text style={styles.reactionOptionText}>{e}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {hasActions && (
              <View style={[styles.messageActions, { borderTopColor: theme.border }]}>
                {onReport && (
                  <TouchableOpacity
                    style={[
                      styles.actionButton,
                      styles.reportButton,
                      { backgroundColor: isDark ? 'rgba(245, 158, 11, 0.15)' : '#FFF3DC' }
                    ]}
                    onPress={() => { setShowPicker(false); onReport(); }}
                  >
                    <Text style={[styles.reportButtonText, { color: isDark ? '#FCD34D' : '#E07B2C' }]}>{t('reportTitle')}</Text>
                  </TouchableOpacity>
                )}
                {onDelete && (
                  <TouchableOpacity
                    style={[
                      styles.actionButton,
                      styles.deleteButton,
                      { backgroundColor: isDark ? 'rgba(239, 68, 68, 0.15)' : '#FEE4E2' }
                    ]}
                    onPress={() => { setShowPicker(false); onDelete(); }}
                  >
                    <Text style={[styles.deleteButtonText, { color: isDark ? '#F87171' : '#D92D20' }]}>{t('delete')}</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>
        )}

        {hasReactions && (
          <View style={[styles.reactionsRow, isOwn && styles.reactionsRowOwn]}>
            {Object.entries(reactions).filter(([, v]) => v > 0).map(([emoji, count]) => (
              <TouchableOpacity
                key={emoji}
                style={[styles.reactionBadge, { backgroundColor: theme.accentLight }]}
                onPress={() => addReaction(emoji)}
              >
                <Text style={[styles.reactionBadgeText, { color: theme.text }]}>{emoji} {count}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { flexDirection: 'row', marginVertical: 3, paddingHorizontal: 12, alignItems: 'flex-end' },
  wrapperOwn: { justifyContent: 'flex-end' },
  avatar: {
    width: 32, height: 32, borderRadius: 16,
    justifyContent: 'center', alignItems: 'center', marginRight: 8,
  },
  avatarText: { fontSize: 14, fontWeight: '700' },
  bubble: { borderRadius: 16, paddingHorizontal: 14, paddingVertical: 9 },
  bubbleOwn: { borderBottomRightRadius: 4 },
  bubbleOther: {
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6, elevation: 2,
  },
  userName: { fontSize: 11, fontWeight: '700', marginBottom: 3 },
  text: { fontSize: 15, lineHeight: 20 },
  messageImage: { width: 210, height: 150, borderRadius: 14, marginBottom: 8 },
  time: { fontSize: 10, marginTop: 4, textAlign: 'right' },
  actionPanel: {
    borderRadius: 16, padding: 6,
    marginTop: 4, alignSelf: 'flex-start',
    borderWidth: 1,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 18, elevation: 4,
  },
  actionPanelOwn: { alignSelf: 'flex-end' },
  reactionPicker: { flexDirection: 'row', gap: 4 },
  reactionOption: { padding: 4 },
  reactionOptionText: { fontSize: 22 },
  messageActions: { flexDirection: 'row', gap: 6, borderTopWidth: 1, marginTop: 4, paddingTop: 6 },
  actionButton: { borderRadius: 12, paddingHorizontal: 10, paddingVertical: 7 },
  reportButton: {},
  reportButtonText: { fontSize: 12, fontWeight: '800' },
  deleteButton: {},
  deleteButtonText: { fontSize: 12, fontWeight: '800' },
  reactionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 },
  reactionsRowOwn: { justifyContent: 'flex-end' },
  reactionBadge: { borderRadius: 12, paddingHorizontal: 8, paddingVertical: 3 },
  reactionBadgeText: { fontSize: 12 },
  aiWrapper: { paddingHorizontal: 12, marginVertical: 6, alignItems: 'center', width: '100%' },
  aiGradientBorder: {
    borderRadius: 16,
    padding: 1.5,
    maxWidth: '88%',
    width: '100%',
  },
  aiMessage: {
    borderRadius: 15,
    padding: 12,
  },
  aiHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  aiBadge: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  aiBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
  },
  aiText: { fontSize: 14, lineHeight: 20 },
  aiTime: { fontSize: 10 },
});

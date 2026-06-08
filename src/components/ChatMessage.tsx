import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Message } from '../types';
import { useTheme } from '../context/ThemeContext';
import { useHaptics } from '../hooks/useHaptics';

interface Props {
  message: Message;
  isOwn: boolean;
  onAvatarPress?: () => void;
}

const REACTION_EMOJIS = ['❤️', '😂', '👍', '🔥', '👏'];

function formatTime(date: Date): string {
  return new Date(date).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

export default function ChatMessage({ message, isOwn, onAvatarPress }: Props) {
  const { theme } = useTheme();
  const haptics = useHaptics();
  const [reactions, setReactions] = useState<Record<string, number>>(
    Object.fromEntries(Object.entries(message.reactions ?? {}).map(([k, v]) => [k, v.length]))
  );
  const [showPicker, setShowPicker] = useState(false);

  function addReaction(emoji: string) {
    haptics.light();
    setReactions(prev => ({ ...prev, [emoji]: (prev[emoji] ?? 0) + 1 }));
    setShowPicker(false);
  }

  const hasReactions = Object.values(reactions).some(v => v > 0);

  if (message.isAI) {
    return (
      <View style={styles.aiWrapper}>
        <View style={[styles.aiMessage, { backgroundColor: theme.card }]}>
          <Text style={styles.aiLabel}>🤖 Жолдас AI</Text>
          <Text style={[styles.aiText, { color: theme.text }]}>{message.text}</Text>
          <Text style={[styles.aiTime, { color: theme.subtext }]}>{formatTime(message.timestamp)}</Text>
        </View>
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
          <View style={[styles.bubble, isOwn ? [styles.bubbleOwn, { backgroundColor: theme.accent }] : [styles.bubbleOther, { backgroundColor: theme.card }]]}>
            {!isOwn && (
              <Text style={[styles.userName, { color: theme.accent }]}>{message.userName}</Text>
            )}
            <Text style={[styles.text, { color: isOwn ? '#FFF' : theme.text }]}>{message.text}</Text>
            <Text style={[styles.time, { color: isOwn ? 'rgba(255,255,255,0.6)' : theme.subtext }]}>
              {formatTime(message.timestamp)}
            </Text>
          </View>
        </TouchableOpacity>

        {showPicker && (
          <View style={[styles.reactionPicker, { backgroundColor: theme.card }, isOwn && styles.reactionPickerOwn]}>
            {REACTION_EMOJIS.map(e => (
              <TouchableOpacity key={e} onPress={() => addReaction(e)} style={styles.reactionOption}>
                <Text style={styles.reactionOptionText}>{e}</Text>
              </TouchableOpacity>
            ))}
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
                <Text style={styles.reactionBadgeText}>{emoji} {count}</Text>
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
  bubble: { borderRadius: 18, paddingHorizontal: 14, paddingVertical: 9 },
  bubbleOwn: { borderBottomRightRadius: 4 },
  bubbleOther: {
    borderBottomLeftRadius: 4,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06, shadowRadius: 3, elevation: 2,
  },
  userName: { fontSize: 11, fontWeight: '700', marginBottom: 3 },
  text: { fontSize: 15, lineHeight: 20 },
  time: { fontSize: 10, marginTop: 4, textAlign: 'right' },
  reactionPicker: {
    flexDirection: 'row', borderRadius: 24, padding: 6, gap: 4,
    marginTop: 4, alignSelf: 'flex-start',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1, shadowRadius: 8, elevation: 4,
  },
  reactionPickerOwn: { alignSelf: 'flex-end' },
  reactionOption: { padding: 4 },
  reactionOptionText: { fontSize: 22 },
  reactionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 },
  reactionsRowOwn: { justifyContent: 'flex-end' },
  reactionBadge: { borderRadius: 12, paddingHorizontal: 8, paddingVertical: 3 },
  reactionBadgeText: { fontSize: 12 },
  aiWrapper: { paddingHorizontal: 12, marginVertical: 4, alignItems: 'center' },
  aiMessage: {
    borderRadius: 14, padding: 12, maxWidth: '88%',
    borderLeftWidth: 3, borderLeftColor: '#F5A623',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  aiLabel: { fontSize: 11, fontWeight: '700', color: '#E07B2C', marginBottom: 4 },
  aiText: { fontSize: 14, lineHeight: 20 },
  aiTime: { fontSize: 10, marginTop: 4, textAlign: 'right' },
});

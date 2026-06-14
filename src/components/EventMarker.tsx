import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Marker, Callout } from 'react-native-maps';
import { Event } from '../types';
import { categoryEmojis } from '../data/mockEvents';
import { useLanguage } from '../context/LanguageContext';

interface Props {
  event: Event;
  joined: boolean;
  onCalloutPress: () => void;
}

export default function EventMarker({ event, joined, onCalloutPress }: Props) {
  const { t } = useLanguage();

  return (
    <Marker coordinate={event.coordinate} tracksViewChanges={false}>
      <View style={[styles.marker, joined && styles.markerJoined]}>
        <Text style={styles.emoji}>{categoryEmojis[event.category]}</Text>
      </View>
      <Callout tooltip onPress={onCalloutPress}>
        <View style={styles.callout}>
          <Text style={styles.calloutTitle}>{event.title}</Text>
          <Text style={styles.calloutTime}>{event.datetime}</Text>
          <View style={styles.calloutRow}>
            <Text style={styles.calloutParticipants}>
              👥 {event.participantsCount}/{event.maxParticipants}
            </Text>
            <Text style={styles.calloutAction}>{t('detailsBtn')} →</Text>
          </View>
        </View>
      </Callout>
    </Marker>
  );
}

const styles = StyleSheet.create({
  marker: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: '#4F46E5', justifyContent: 'center', alignItems: 'center',
    shadowColor: '#101828', shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.22, shadowRadius: 12, elevation: 5,
    borderWidth: 2.5, borderColor: '#FFF',
  },
  markerJoined: { backgroundColor: '#2E9E5D' },
  emoji: { fontSize: 20 },
  callout: {
    backgroundColor: '#FFF', borderRadius: 14, padding: 14, minWidth: 200,
    borderWidth: 1, borderColor: '#E4E7EC',
    shadowColor: '#101828', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12, shadowRadius: 18, elevation: 8,
  },
  calloutTitle: { fontSize: 15, fontWeight: '800', color: '#111827', marginBottom: 4 },
  calloutTime: { fontSize: 12, color: '#4338CA', marginBottom: 8 },
  calloutRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  calloutParticipants: { fontSize: 13, color: '#475467' },
  calloutAction: { fontSize: 13, color: '#4338CA', fontWeight: '700' },
});

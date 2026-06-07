import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Marker, Callout } from 'react-native-maps';
import { Event } from '../types';
import { categoryEmojis } from '../data/mockEvents';

interface Props {
  event: Event;
  joined: boolean;
  onCalloutPress: () => void;
}

export default function EventMarker({ event, joined, onCalloutPress }: Props) {
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
            <Text style={styles.calloutAction}>Подробнее →</Text>
          </View>
        </View>
      </Callout>
    </Marker>
  );
}

const styles = StyleSheet.create({
  marker: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: '#5B4FCF', justifyContent: 'center', alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25, shadowRadius: 4, elevation: 5,
    borderWidth: 2.5, borderColor: '#FFF',
  },
  markerJoined: { backgroundColor: '#2ECC71' },
  emoji: { fontSize: 20 },
  callout: {
    backgroundColor: '#FFF', borderRadius: 14, padding: 14, minWidth: 200,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15, shadowRadius: 8, elevation: 8,
  },
  calloutTitle: { fontSize: 15, fontWeight: '700', color: '#1A1A2E', marginBottom: 4 },
  calloutTime: { fontSize: 12, color: '#5B4FCF', marginBottom: 8 },
  calloutRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  calloutParticipants: { fontSize: 13, color: '#555' },
  calloutAction: { fontSize: 13, color: '#5B4FCF', fontWeight: '600' },
});

import { useState, useEffect } from 'react';
import { Linking, Platform } from 'react-native';
import * as Location from 'expo-location';

export interface UserLocation {
  latitude: number;
  longitude: number;
}

export function useLocation(): UserLocation | null {
  const [location, setLocation] = useState<UserLocation | null>(null);

  useEffect(() => {
    Location.requestForegroundPermissionsAsync().then(({ status }) => {
      if (status !== 'granted') return;
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }).then(loc => {
        setLocation({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
      });
    });
  }, []);

  return location;
}

export function getDistance(from: UserLocation, to: { latitude: number; longitude: number }): string {
  const R = 6371;
  const dLat = (to.latitude - from.latitude) * Math.PI / 180;
  const dLon = (to.longitude - from.longitude) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(from.latitude * Math.PI / 180) *
    Math.cos(to.latitude * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  const km = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  if (km < 1) return `${Math.round(km * 1000)} м`;
  return `${km.toFixed(1)} км`;
}

export async function openRoute(to: { latitude: number; longitude: number }, label = 'Zholdas event') {
  const destination = `${to.latitude},${to.longitude}`;
  const encodedLabel = encodeURIComponent(label);
  const url = Platform.select({
    ios: `http://maps.apple.com/?daddr=${destination}&q=${encodedLabel}`,
    android: `google.navigation:q=${destination}`,
    default: `https://www.google.com/maps/dir/?api=1&destination=${destination}`,
  });

  if (!url) return;

  const fallbackUrl = `https://www.google.com/maps/dir/?api=1&destination=${destination}`;
  const canOpen = await Linking.canOpenURL(url);
  await Linking.openURL(canOpen ? url : fallbackUrl);
}

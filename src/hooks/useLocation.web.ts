import { useEffect, useState } from 'react';

export interface UserLocation {
  latitude: number;
  longitude: number;
}

export const ALMATY_LOCATION: UserLocation = {
  latitude: 43.238,
  longitude: 76.945,
};

export function getDistanceKm(from: UserLocation, to: UserLocation): number {
  const R = 6371;
  const dLat = (to.latitude - from.latitude) * Math.PI / 180;
  const dLon = (to.longitude - from.longitude) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(from.latitude * Math.PI / 180) *
    Math.cos(to.latitude * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function normalizeForAlmaty(location: UserLocation): UserLocation {
  return getDistanceKm(location, ALMATY_LOCATION) > 250 ? ALMATY_LOCATION : location;
}

export function useLocation(): UserLocation | null {
  const [location, setLocation] = useState<UserLocation | null>(null);

  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      position => {
        setLocation(normalizeForAlmaty({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        }));
      },
      () => {},
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 },
    );
  }, []);

  return location;
}

export function getDistance(from: UserLocation, to: { latitude: number; longitude: number }): string {
  const km = getDistanceKm(from, to);
  if (km < 1) return `${Math.round(km * 1000)} м`;
  return `${km.toFixed(1)} км`;
}

export async function openRoute(to: { latitude: number; longitude: number }, label = 'Zholdas event') {
  const destination = `${to.latitude},${to.longitude}`;
  const encodedLabel = encodeURIComponent(label);
  const url = `https://www.google.com/maps/dir/?api=1&destination=${destination}&query=${encodedLabel}`;
  window.open(url, '_blank', 'noopener,noreferrer');
}

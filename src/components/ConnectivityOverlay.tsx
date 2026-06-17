import React from 'react';
import { Image, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useLanguage } from '../context/LanguageContext';

export default function ConnectivityOverlay() {
  const { t } = useLanguage();
  const [isOffline, setIsOffline] = React.useState(false);

  React.useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;

    const updateOnlineState = () => setIsOffline(!window.navigator.onLine);
    updateOnlineState();

    window.addEventListener('online', updateOnlineState);
    window.addEventListener('offline', updateOnlineState);

    return () => {
      window.removeEventListener('online', updateOnlineState);
      window.removeEventListener('offline', updateOnlineState);
    };
  }, []);

  if (!isOffline) return null;

  return (
    <View style={styles.overlay}>
      <View style={styles.card}>
        <Image source={require('../../assets/icon.png')} style={styles.logo} />
        <Text style={styles.title}>{t('offlineTitle')}</Text>
        <Text style={styles.text}>{t('offlineText')}</Text>
        <TouchableOpacity
          style={styles.button}
          onPress={() => {
            if (typeof window !== 'undefined') window.location.reload();
          }}
          activeOpacity={0.86}
        >
          <Text style={styles.buttonText}>{t('retry')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9998,
    backgroundColor: 'rgba(13,20,38,0.96)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 26,
    padding: 24,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
  },
  logo: {
    width: 72,
    height: 72,
    borderRadius: 22,
    marginBottom: 18,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '900',
    textAlign: 'center',
    marginBottom: 8,
  },
  text: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
  button: {
    marginTop: 20,
    minWidth: 150,
    minHeight: 46,
    borderRadius: 16,
    backgroundColor: '#7167FF',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 22,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '900',
  },
});

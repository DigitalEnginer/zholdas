import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  Dimensions,
  Animated,
  Image,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../context/ThemeContext';
import { useLanguage } from '../context/LanguageContext';

export default function PwaInstallPrompt() {
  const { theme } = useTheme();
  const { t } = useLanguage();
  const [isVisible, setIsVisible] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const slideAnim = useRef(new Animated.Value(300)).current;
  const visibleRef = useRef(false);

  useEffect(() => {
    if (Platform.OS !== 'web') return;

    let timer: ReturnType<typeof setTimeout> | undefined;
    let fallbackTimer: ReturnType<typeof setTimeout> | undefined;
    let isMounted = true;

    const showPrompt = () => {
      if (!isMounted || visibleRef.current) return;
      visibleRef.current = true;
      setIsVisible(true);
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        tension: 50,
        friction: 9,
      }).start();
    };

    const handleBeforeInstallPrompt = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
      showPrompt();
    };

    async function checkPwaStatus() {
      const isMobile = Dimensions.get('window').width < 768;
      if (!isMobile) return;

      const isStandalone =
        window.matchMedia('(display-mode: standalone)').matches ||
        (window.navigator as any).standalone === true;
      if (isStandalone) return;

      const dismissedAt = await AsyncStorage.getItem('pwa_prompt_dismissed_at');
      if (dismissedAt && Date.now() - Number(dismissedAt) < 7 * 24 * 60 * 60 * 1000) return;

      const userAgent = window.navigator.userAgent.toLowerCase();
      const isApple = /iphone|ipad|ipod/.test(userAgent);
      setIsIOS(isApple);

      if (isApple) {
        timer = setTimeout(showPrompt, 3000);
        return;
      }

      window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

      fallbackTimer = setTimeout(showPrompt, 6000);
    }

    checkPwaStatus();

    return () => {
      isMounted = false;
      if (timer) clearTimeout(timer);
      if (fallbackTimer) clearTimeout(fallbackTimer);
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, [slideAnim]);

  const handleDismiss = async () => {
    Animated.timing(slideAnim, {
      toValue: 300,
      duration: 250,
      useNativeDriver: true,
    }).start(async () => {
      setIsVisible(false);
      visibleRef.current = false;
      await AsyncStorage.setItem('pwa_prompt_dismissed_at', String(Date.now()));
    });
  };

  const handleInstall = async () => {
    if (!deferredPrompt) {
      alert(t('pwaInstallFallback'));
      return;
    }

    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;

    if (outcome === 'accepted') {
      await AsyncStorage.setItem('pwa_prompt_dismissed_at', String(Date.now()));
      setIsVisible(false);
      visibleRef.current = false;
    }
    setDeferredPrompt(null);
  };

  if (!isVisible) return null;

  return (
    <Animated.View
      style={[
        styles.container,
        {
          backgroundColor: theme.card,
          borderColor: theme.border,
          transform: [{ translateY: slideAnim }],
        },
      ]}
    >
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Image source={require('../../assets/icon.png')} style={styles.logo} />
          <Text style={[styles.title, { color: theme.text }]}>{t('pwaInstallTitle')}</Text>
        </View>
        <TouchableOpacity onPress={handleDismiss} style={styles.closeButton}>
          <Text style={[styles.closeText, { color: theme.subtext }]}>x</Text>
        </TouchableOpacity>
      </View>

      <Text style={[styles.description, { color: theme.subtext }]}>
        {isIOS ? (
          <>
            {t('pwaInstallIOSBefore')} <Text style={styles.bold}>{t('pwaInstallIOSShare')}</Text>{' '}
            {t('pwaInstallIOSMiddle')} <Text style={styles.bold}>{t('pwaInstallIOSHome')}</Text>{' '}
            {t('pwaInstallIOSAfter')}
          </>
        ) : (
          t('pwaInstallAndroid')
        )}
      </Text>

      {!isIOS && (
        <TouchableOpacity
          style={[styles.installButton, { backgroundColor: theme.accent }]}
          onPress={handleInstall}
          activeOpacity={0.8}
        >
          <Text style={styles.installButtonText}>{t('pwaInstallButton')}</Text>
        </TouchableOpacity>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 24,
    left: 16,
    right: 16,
    padding: 18,
    borderRadius: 22,
    borderWidth: 1,
    zIndex: 9999,
    shadowColor: '#101828',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 8,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: '800',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  logo: {
    width: 30,
    height: 30,
    borderRadius: 9,
  },
  closeButton: {
    padding: 4,
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeText: {
    fontSize: 14,
    fontWeight: '600',
  },
  description: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 12,
  },
  bold: {
    fontWeight: '700',
  },
  installButton: {
    minHeight: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  installButtonText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '700',
  },
});

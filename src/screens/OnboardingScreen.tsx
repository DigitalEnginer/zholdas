import React, { useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, Dimensions, Animated, SafeAreaView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { RootStackParamList } from '../types';
import { useHaptics } from '../hooks/useHaptics';
import { useLanguage } from '../context/LanguageContext';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Props = {
  onDone?: () => void;
};

const { width } = Dimensions.get('window');

export default function OnboardingScreen({ onDone }: Props) {
  const navigation = useNavigation<Nav>();
  const haptics = useHaptics();
  const { t } = useLanguage();
  const [current, setCurrent] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const dotAnim = useRef([0, 1, 2].map(() => new Animated.Value(0))).current;

  const slides = [
    {
      emoji: '🗺️',
      title: t('onboardingSlide1Title'),
      subtitle: t('onboardingSlide1Sub'),
      gradient: ['#1E3A8A', '#312E81'] as [string, string],
    },
    {
      emoji: '🤝',
      title: t('onboardingSlide2Title'),
      subtitle: t('onboardingSlide2Sub'),
      gradient: ['#065F46', '#312E81'] as [string, string],
    },
    {
      emoji: '💬',
      title: t('onboardingSlide3Title'),
      subtitle: t('onboardingSlide3Sub'),
      gradient: ['#0369A1', '#065F46'] as [string, string],
    },
  ];

  function animateDot(index: number) {
    dotAnim.forEach((anim, i) => {
      Animated.timing(anim, {
        toValue: i === index ? 1 : 0,
        duration: 250,
        useNativeDriver: false,
      }).start();
    });
  }

  function handleScroll(e: any) {
    const index = Math.round(e.nativeEvent.contentOffset.x / width);
    if (index !== current) {
      setCurrent(index);
      animateDot(index);
    }
  }

  async function finish() {
    haptics.success();
    await AsyncStorage.setItem('onboarding_done', 'true');
    onDone?.();
    navigation.replace('Auth');
  }

  function next() {
    haptics.light();
    if (current < slides.length - 1) {
      const nextIndex = current + 1;
      // Use scrollTo — works reliably on both native and web
      scrollRef.current?.scrollTo({ x: width * nextIndex, animated: true });
      setCurrent(nextIndex);
      animateDot(nextIndex);
    } else {
      finish();
    }
  }

  React.useEffect(() => { animateDot(0); }, []);

  return (
    <View style={styles.container}>
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={handleScroll}
        scrollEventThrottle={16}
        style={{ flex: 1 }}
      >
        {slides.map((item, index) => (
          <LinearGradient key={index} colors={item.gradient} style={styles.slide}>
            <SafeAreaView style={styles.slideSafe}>
              <View style={styles.slideContent}>
                <View style={styles.glassCard}>
                  <Text style={styles.emoji}>{item.emoji}</Text>
                  <Text style={styles.title}>{item.title}</Text>
                  <Text style={styles.subtitle}>{item.subtitle}</Text>
                </View>
              </View>
            </SafeAreaView>
          </LinearGradient>
        ))}
      </ScrollView>

      <View style={styles.bottom}>
        <View style={styles.dots}>
          {slides.map((_, i) => (
            <Animated.View
              key={i}
              style={[
                styles.dot,
                {
                  width: dotAnim[i].interpolate({ inputRange: [0, 1], outputRange: [8, 28] }),
                  opacity: dotAnim[i].interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] }),
                },
              ]}
            />
          ))}
        </View>

        <TouchableOpacity style={styles.nextBtn} onPress={next} activeOpacity={0.9}>
          <Text style={styles.nextBtnText}>
            {current === slides.length - 1 ? t('onboardingStart') : `${t('onboardingNext')} →`}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={finish} style={styles.skipBtn} activeOpacity={0.7}>
          <Text style={styles.skipText}>
            {current === slides.length - 1 ? '' : t('onboardingSkip')}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0F1D' },
  slide: { width, flex: 1 },
  slideSafe: { flex: 1 },
  slideContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingBottom: 160,
  },
  glassCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 28,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    padding: 32,
    alignItems: 'center',
    width: '100%',
    maxWidth: 380,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.2,
    shadowRadius: 24,
    elevation: 6,
  },
  emoji: { fontSize: 72, marginBottom: 24 },
  title: {
    fontSize: 26, fontWeight: '900', color: '#FFF',
    textAlign: 'center', lineHeight: 34, marginBottom: 16,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 15, color: 'rgba(255, 255, 255, 0.85)',
    textAlign: 'center', lineHeight: 22,
  },
  bottom: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    paddingBottom: 48, paddingHorizontal: 24, alignItems: 'center',
    zIndex: 10,
  },
  dots: { flexDirection: 'row', gap: 8, marginBottom: 28 },
  dot: { height: 4, borderRadius: 2, backgroundColor: '#FFF' },
  nextBtn: {
    width: '100%', maxWidth: 380, backgroundColor: '#FFF', borderRadius: 16,
    paddingVertical: 18, alignItems: 'center', marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 3,
  },
  nextBtnText: { fontSize: 16, fontWeight: '800', color: '#0F172A', letterSpacing: 0.3 },
  skipBtn: { paddingVertical: 10, paddingHorizontal: 20, minHeight: 34 },
  skipText: { fontSize: 14, color: 'rgba(255, 255, 255, 0.7)', fontWeight: '600', letterSpacing: 0.5 },
});

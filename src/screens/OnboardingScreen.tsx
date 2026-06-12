import React, { useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  FlatList, Dimensions, Animated,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { RootStackParamList } from '../types';
import { useHaptics } from '../hooks/useHaptics';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Props = {
  onDone?: () => void;
};

const { width } = Dimensions.get('window');

const SLIDES = [
  {
    emoji: '🗺️',
    title: 'Находи активности\nв Алматы',
    subtitle: 'Поход, театр, волейбол — видь на карте что происходит вокруг тебя прямо сейчас',
    gradient: ['#2563EB', '#4F46E5'] as [string, string],
  },
  {
    emoji: '🤝',
    title: 'Присоединяйся\nк группам',
    subtitle: 'Не нужно идти одному. Нажми «Присоединиться» и познакомься с новыми людьми',
    gradient: ['#0F766E', '#4F46E5'] as [string, string],
  },
  {
    emoji: '💬',
    title: 'Общайся\nс участниками',
    subtitle: 'Чат внутри каждого ивента и AI-ассистент помогут организоваться и не пропустить ничего важного',
    gradient: ['#0EA5E9', '#0F766E'] as [string, string],
  },
];

export default function OnboardingScreen({ onDone }: Props) {
  const navigation = useNavigation<Nav>();
  const haptics = useHaptics();
  const [current, setCurrent] = useState(0);
  const flatListRef = useRef<FlatList>(null);
  const dotAnim = useRef(SLIDES.map(() => new Animated.Value(0))).current;

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
    if (current < SLIDES.length - 1) {
      flatListRef.current?.scrollToIndex({ index: current + 1 });
    } else {
      finish();
    }
  }

  React.useEffect(() => { animateDot(0); }, []);

  return (
    <View style={styles.container}>
      <FlatList
        ref={flatListRef}
        data={SLIDES}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        keyExtractor={(_, i) => String(i)}
        renderItem={({ item }) => (
          <LinearGradient colors={item.gradient} style={styles.slide}>
            <View style={styles.slideContent}>
              <Text style={styles.emoji}>{item.emoji}</Text>
              <Text style={styles.title}>{item.title}</Text>
              <Text style={styles.subtitle}>{item.subtitle}</Text>
            </View>
          </LinearGradient>
        )}
      />

      <View style={styles.bottom}>
        <View style={styles.dots}>
          {SLIDES.map((_, i) => (
            <Animated.View
              key={i}
              style={[
                styles.dot,
                {
                  width: dotAnim[i].interpolate({ inputRange: [0, 1], outputRange: [8, 24] }),
                  opacity: dotAnim[i].interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }),
                },
              ]}
            />
          ))}
        </View>

        <TouchableOpacity style={styles.nextBtn} onPress={next} activeOpacity={0.85}>
          <Text style={styles.nextBtnText}>
            {current === SLIDES.length - 1 ? 'Начать 🚀' : 'Далее →'}
          </Text>
        </TouchableOpacity>

        {current < SLIDES.length - 1 && (
          <TouchableOpacity onPress={finish} style={styles.skipBtn}>
            <Text style={styles.skipText}>Пропустить</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0B1220' },
  slide: { width, flex: 1 },
  slideContent: {
    flex: 1, justifyContent: 'center', alignItems: 'center',
    paddingHorizontal: 32, paddingBottom: 180,
  },
  emoji: { fontSize: 80, marginBottom: 32 },
  title: {
    fontSize: 32, fontWeight: '900', color: '#FFF',
    textAlign: 'center', lineHeight: 40, marginBottom: 16,
    maxWidth: 560,
  },
  subtitle: {
    fontSize: 16, color: 'rgba(255,255,255,0.8)',
    textAlign: 'center', lineHeight: 24,
    maxWidth: 680,
  },
  bottom: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    paddingBottom: 52, paddingHorizontal: 24, alignItems: 'center',
    zIndex: 10,
  },
  dots: { flexDirection: 'row', gap: 6, marginBottom: 28 },
  dot: { height: 8, borderRadius: 4, backgroundColor: '#FFF' },
  nextBtn: {
    width: '100%', maxWidth: 560, backgroundColor: '#FFF', borderRadius: 14,
    paddingVertical: 17, alignItems: 'center', marginBottom: 12,
  },
  nextBtnText: { fontSize: 17, fontWeight: '800', color: '#4338CA' },
  skipBtn: { paddingVertical: 8 },
  skipText: { fontSize: 14, color: 'rgba(255,255,255,0.6)' },
});

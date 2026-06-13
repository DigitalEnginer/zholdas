import React, { createContext, useContext, useState, useEffect } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const light = {
  bg: '#F8FAFC',
  card: '#FFFFFF',
  text: '#0F172A',
  subtext: '#475569',
  border: '#E2E8F0',
  accent: '#2563EB',
  accentLight: '#EFF6FF',
  accentText: '#1D4ED8',
  inputBg: '#F1F5F9',
  tabBar: '#FFFFFF',
  danger: '#EF4444',
  warning: '#F59E0B',
  success: '#10B981',
};

const dark = {
  bg: '#0A0F1D',
  card: '#151E2E',
  text: '#F8FAFC',
  subtext: '#94A3B8',
  border: '#1E293B',
  accent: '#6366F1',
  accentLight: '#1E2243',
  accentText: '#A5B4FC',
  inputBg: '#0E1325',
  tabBar: '#101625',
  danger: '#F87171',
  warning: '#FBBF24',
  success: '#34D399',
};

type Theme = typeof light;
interface ThemeContextType {
  theme: Theme;
  isDark: boolean;
  themeMode: 'light' | 'dark' | 'system';
  setThemeMode: (mode: 'light' | 'dark' | 'system') => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: light,
  isDark: false,
  themeMode: 'system',
  setThemeMode: () => {},
  toggleTheme: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [themeMode, setThemeModeState] = useState<'light' | 'dark' | 'system'>('system');

  useEffect(() => {
    AsyncStorage.getItem('theme_mode').then(val => {
      if (val === 'light' || val === 'dark' || val === 'system') {
        setThemeModeState(val);
      }
    });
  }, []);

  const setThemeMode = async (mode: 'light' | 'dark' | 'system') => {
    setThemeModeState(mode);
    await AsyncStorage.setItem('theme_mode', mode);
  };

  const isDark = themeMode === 'system' ? systemScheme === 'dark' : themeMode === 'dark';

  const toggleTheme = () => {
    setThemeMode(isDark ? 'light' : 'dark');
  };

  return (
    <ThemeContext.Provider value={{ theme: isDark ? dark : light, isDark, themeMode, setThemeMode, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);

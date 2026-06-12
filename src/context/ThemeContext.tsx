import React, { createContext, useContext } from 'react';
import { useColorScheme } from 'react-native';

const light = {
  bg: '#F6F7FB',
  card: '#FFFFFF',
  text: '#111827',
  subtext: '#667085',
  border: '#E4E7EC',
  accent: '#4F46E5',
  accentLight: '#EEF2FF',
  accentText: '#4338CA',
  inputBg: '#F9FAFB',
  tabBar: '#FFFFFF',
  danger: '#D92D20',
  warning: '#E07B2C',
  success: '#2E9E5D',
};

const dark = {
  bg: '#0B1220',
  card: '#111827',
  text: '#F9FAFB',
  subtext: '#98A2B3',
  border: '#263244',
  accent: '#818CF8',
  accentLight: '#1F2A44',
  accentText: '#C7D2FE',
  inputBg: '#0F172A',
  tabBar: '#111827',
  danger: '#F97066',
  warning: '#FDB022',
  success: '#32D583',
};

type Theme = typeof light;
interface ThemeContextType { theme: Theme; isDark: boolean }

const ThemeContext = createContext<ThemeContextType>({ theme: light, isDark: false });

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  return (
    <ThemeContext.Provider value={{ theme: isDark ? dark : light, isDark }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);

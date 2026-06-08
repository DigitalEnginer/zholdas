import React, { createContext, useContext } from 'react';
import { useColorScheme } from 'react-native';

const light = {
  bg: '#F8F7FF',
  card: '#FFFFFF',
  text: '#1A1A2E',
  subtext: '#888888',
  border: '#E8E5FF',
  accent: '#5B4FCF',
  accentLight: '#F0EEFF',
  accentText: '#5B4FCF',
  inputBg: '#F8F7FF',
  tabBar: '#FFFFFF',
  danger: '#FF4D4D',
  warning: '#F5A623',
  success: '#2ECC71',
};

const dark = {
  bg: '#0F0E1A',
  card: '#1E1D2E',
  text: '#F0EEFF',
  subtext: '#9990CC',
  border: '#2E2A4E',
  accent: '#7B6FDF',
  accentLight: '#2E2A4E',
  accentText: '#A89FEF',
  inputBg: '#1A1929',
  tabBar: '#1E1D2E',
  danger: '#FF6B6B',
  warning: '#F5A623',
  success: '#2ECC71',
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

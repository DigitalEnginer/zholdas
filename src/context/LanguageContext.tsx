import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Locale, TranslationKey, translations } from '../localization/translations';

interface LanguageContextType {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: TranslationKey | string, defaultText?: string) => string;
  toggleLanguage: () => void;
}

const LanguageContext = createContext<LanguageContextType>({
  locale: 'ru',
  setLocale: () => {},
  t: (key) => String(key),
  toggleLanguage: () => {},
});

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>('ru');

  useEffect(() => {
    AsyncStorage.getItem('app_locale').then(val => {
      if (val === 'ru' || val === 'kk') {
        setLocaleState(val);
      }
    });
  }, []);

  const setLocale = async (newLocale: Locale) => {
    setLocaleState(newLocale);
    await AsyncStorage.setItem('app_locale', newLocale);
  };

  const toggleLanguage = () => {
    setLocale(locale === 'ru' ? 'kk' : 'ru');
  };

  const t = (key: string, defaultText?: string): string => {
    const localeDict = translations[locale] as Record<string, string>;
    const ruDict = translations['ru'] as Record<string, string>;
    
    if (localeDict && localeDict[key]) {
      return localeDict[key];
    }
    if (ruDict && ruDict[key]) {
      return ruDict[key];
    }
    return defaultText ?? key;
  };

  return (
    <LanguageContext.Provider value={{ locale, setLocale, t, toggleLanguage }}>
      {children}
    </LanguageContext.Provider>
  );
}

export const useLanguage = () => useContext(LanguageContext);

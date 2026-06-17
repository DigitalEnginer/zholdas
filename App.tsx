import 'react-native-url-polyfill/auto';
import 'react-native-gesture-handler';
import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider } from './src/context/AuthContext';
import { EventsProvider } from './src/context/EventsContext';
import { ThemeProvider, useTheme } from './src/context/ThemeContext';
import { BadgeProvider } from './src/context/BadgeContext';
import { LanguageProvider } from './src/context/LanguageContext';
import AppNavigator from './src/navigation/AppNavigator';
import PwaInstallPrompt from './src/components/PwaInstallPrompt';
import AppErrorBoundary from './src/components/AppErrorBoundary';
import ConnectivityOverlay from './src/components/ConnectivityOverlay';

function Root() {
  const { isDark } = useTheme();
  return (
    <>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <AppNavigator />
      <ConnectivityOverlay />
      <PwaInstallPrompt />
    </>
  );
}

export default function App() {
  return (
    <AppErrorBoundary>
      <ThemeProvider>
        <LanguageProvider>
          <AuthProvider>
            <EventsProvider>
              <BadgeProvider>
                <Root />
              </BadgeProvider>
            </EventsProvider>
          </AuthProvider>
        </LanguageProvider>
      </ThemeProvider>
    </AppErrorBoundary>
  );
}

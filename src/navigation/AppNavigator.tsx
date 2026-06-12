import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import AsyncStorage from '@react-native-async-storage/async-storage';

import MapScreen from '../screens/MapScreen';
import ListScreen from '../screens/ListScreen';
import ProfileScreen from '../screens/ProfileScreen';
import ChatScreen from '../screens/ChatScreen';
import CreateEventScreen from '../screens/CreateEventScreen';
import ReviewScreen from '../screens/ReviewScreen';
import OnboardingScreen from '../screens/OnboardingScreen';
import LoginScreen from '../screens/LoginScreen';
import RegisterScreen from '../screens/RegisterScreen';
import ActivityScreen from '../screens/ActivityScreen';
import UserProfileScreen from '../screens/UserProfileScreen';
import EditProfileScreen from '../screens/EditProfileScreen';
import ModeratorDashboardScreen from '../screens/ModeratorDashboardScreen';
import EventParticipantsScreen from '../screens/EventParticipantsScreen';
import FriendsScreen from '../screens/FriendsScreen';
import NotificationsScreen from '../screens/NotificationsScreen';
import AdminRolesScreen from '../screens/AdminRolesScreen';
import EventDetailsScreen from '../screens/EventDetailsScreen';

import { RootStackParamList, BottomTabParamList } from '../types';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useBadge } from '../context/BadgeContext';

const Tab = createBottomTabNavigator<BottomTabParamList>();
const Stack = createNativeStackNavigator<RootStackParamList>();

const TAB_ICONS: Record<string, string> = { Map: '🗺', List: '📋', Activity: '🔔', Profile: '👤' };

function TabIcon({ name, focused, theme, badge }: { name: string; focused: boolean; theme: any; badge?: number }) {
  return (
    <View style={[styles.tabIcon, focused && { backgroundColor: theme.accentLight }]}>
      <Text style={styles.tabEmoji}>{TAB_ICONS[name]}</Text>
      {badge != null && badge > 0 && (
        <View style={styles.badgeDot}>
          <Text style={styles.badgeDotText}>{badge > 9 ? '9+' : badge}</Text>
        </View>
      )}
    </View>
  );
}

function MainTabs() {
  const { theme } = useTheme();
  const { activityBadge } = useBadge();
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarLabelStyle: [styles.tabLabel, { color: theme.subtext }],
        tabBarActiveTintColor: theme.accent,
        tabBarInactiveTintColor: theme.subtext,
        tabBarStyle: [styles.tabBar, { backgroundColor: theme.tabBar, borderTopColor: theme.border }],
        tabBarIcon: ({ focused }) => (
          <TabIcon
            name={route.name}
            focused={focused}
            theme={theme}
            badge={route.name === 'Activity' ? activityBadge : undefined}
          />
        ),
      })}
    >
      <Tab.Screen name="Map" component={MapScreen} options={{ title: 'Карта' }} />
      <Tab.Screen name="List" component={ListScreen} options={{ title: 'Ивенты' }} />
      <Tab.Screen name="Activity" component={ActivityScreen} options={{ title: 'Активность' }} />
      <Tab.Screen name="Profile" component={ProfileScreen} options={{ title: 'Профиль' }} />
    </Tab.Navigator>
  );
}

function AuthStack() {
  const { theme } = useTheme();
  return (
    <Stack.Navigator screenOptions={{
      headerStyle: { backgroundColor: theme.card },
      headerTintColor: theme.accent,
      headerTitleStyle: { fontWeight: '700', color: theme.text },
      headerShadowVisible: false,
      contentStyle: { backgroundColor: theme.bg },
    }}>
      <Stack.Screen name="Auth" component={LoginScreen} options={{ headerShown: false }} />
      <Stack.Screen name="Register" component={RegisterScreen as any} options={{ title: 'Регистрация' }} />
    </Stack.Navigator>
  );
}

function BannedAccountScreen() {
  const { theme } = useTheme();
  const { user, logout } = useAuth();

  return (
    <View style={[styles.bannedContainer, { backgroundColor: theme.bg }]}>
      <View style={[styles.bannedPanel, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <Text style={styles.bannedIcon}>!</Text>
        <Text style={[styles.bannedTitle, { color: theme.text }]}>Аккаунт заблокирован</Text>
        <Text style={[styles.bannedText, { color: theme.subtext }]}>
          {user?.banReason || 'Доступ к функциям приложения ограничен модератором.'}
        </Text>
        <Text style={[styles.bannedHint, { color: theme.subtext }]}>
          Если это ошибка, свяжитесь с поддержкой Жолдас.
        </Text>
        <Text style={[styles.logoutButton, { backgroundColor: theme.accent }]} onPress={logout}>
          Выйти
        </Text>
      </View>
    </View>
  );
}

export default function AppNavigator() {
  const { user, isLoading } = useAuth();
  const { theme, isDark } = useTheme();
  const [showOnboarding, setShowOnboarding] = React.useState<boolean | null>(null);

  React.useEffect(() => {
    AsyncStorage.getItem('onboarding_done').then(v => setShowOnboarding(!v));
  }, []);

  if (isLoading || showOnboarding === null) return null;

  const navTheme = isDark
    ? { ...DarkTheme, colors: { ...DarkTheme.colors, background: theme.bg, card: theme.card } }
    : { ...DefaultTheme, colors: { ...DefaultTheme.colors, background: theme.bg, card: theme.card } };

  return (
    <NavigationContainer theme={navTheme}>
      <Stack.Navigator screenOptions={{
        headerStyle: { backgroundColor: theme.card },
        headerTintColor: theme.accent,
        headerTitleStyle: { fontWeight: '700', color: theme.text },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: theme.bg },
      }}>
        {showOnboarding && !user && (
          <Stack.Screen name="Onboarding" options={{ headerShown: false }}>
            {props => (
              <OnboardingScreen
                {...props}
                onDone={() => setShowOnboarding(false)}
              />
            )}
          </Stack.Screen>
        )}
        {!user ? (
          <>
            <Stack.Screen name="Auth" component={LoginScreen} options={{ headerShown: false }} />
            <Stack.Screen name="Register" component={RegisterScreen as any} options={{ title: 'Регистрация', headerBackTitle: 'Назад' }} />
          </>
        ) : user.isBanned ? (
          <Stack.Screen name="Main" component={BannedAccountScreen} options={{ headerShown: false }} />
        ) : (
          <>
            <Stack.Screen name="Main" component={MainTabs} options={{ headerShown: false }} />
            <Stack.Screen name="EventDetails" component={EventDetailsScreen} options={{ title: 'Ивент', headerBackTitle: 'Назад' }} />
            <Stack.Screen name="Chat" component={ChatScreen} options={{ headerBackTitle: 'Назад' }} />
            <Stack.Screen name="CreateEvent" component={CreateEventScreen} options={{ title: 'Новый ивент', headerBackTitle: 'Назад' }} />
            <Stack.Screen name="Review" component={ReviewScreen} options={{ title: 'Оценить участников', headerBackTitle: 'Назад' }} />
            <Stack.Screen name="UserProfile" component={UserProfileScreen} options={{ title: '', headerBackTitle: 'Назад' }} />
            <Stack.Screen name="EditProfile" component={EditProfileScreen} options={{ title: 'Редактировать', headerBackTitle: 'Назад' }} />
            <Stack.Screen name="ModeratorDashboard" component={ModeratorDashboardScreen} options={{ title: 'Модерация', headerBackTitle: 'Назад' }} />
            <Stack.Screen name="EventParticipants" component={EventParticipantsScreen} options={{ title: 'Участники', headerBackTitle: 'Назад' }} />
            <Stack.Screen name="Friends" component={FriendsScreen} options={{ title: 'Друзья', headerBackTitle: 'Назад' }} />
            <Stack.Screen name="Notifications" component={NotificationsScreen} options={{ title: 'Уведомления', headerBackTitle: 'Назад' }} />
            <Stack.Screen name="AdminRoles" component={AdminRolesScreen} options={{ title: 'Роли', headerBackTitle: 'Назад' }} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    borderTopWidth: 1, elevation: 0,
    shadowColor: '#5B4FCF', shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.08, shadowRadius: 12, height: 70,
    paddingBottom: 10, paddingTop: 6,
  },
  tabLabel: { fontSize: 11, fontWeight: '600' },
  tabIcon: { width: 36, height: 28, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  tabEmoji: { fontSize: 18 },
  badgeDot: {
    position: 'absolute', top: -4, right: -6,
    backgroundColor: '#FF4D4D', borderRadius: 8,
    minWidth: 16, height: 16, justifyContent: 'center', alignItems: 'center',
    paddingHorizontal: 3,
  },
  badgeDotText: { fontSize: 9, color: '#FFF', fontWeight: '800' },
  bannedContainer: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  bannedPanel: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
  },
  bannedIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#D92D20',
    color: '#FFF',
    textAlign: 'center',
    lineHeight: 44,
    fontSize: 24,
    fontWeight: '900',
    marginBottom: 14,
  },
  bannedTitle: { fontSize: 22, fontWeight: '800', marginBottom: 8, textAlign: 'center' },
  bannedText: { fontSize: 15, lineHeight: 21, textAlign: 'center' },
  bannedHint: { fontSize: 13, lineHeight: 18, textAlign: 'center', marginTop: 12 },
  logoutButton: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '800',
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 20,
    marginTop: 20,
    overflow: 'hidden',
  },
});

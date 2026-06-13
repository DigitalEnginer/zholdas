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
import AdminDashboardScreen from '../screens/AdminDashboardScreen';
import EventParticipantsScreen from '../screens/EventParticipantsScreen';
import FriendsScreen from '../screens/FriendsScreen';
import NotificationsScreen from '../screens/NotificationsScreen';
import AdminRolesScreen from '../screens/AdminRolesScreen';
import EventDetailsScreen from '../screens/EventDetailsScreen';

import { RootStackParamList, BottomTabParamList } from '../types';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useBadge } from '../context/BadgeContext';
import { useLanguage } from '../context/LanguageContext';

const Tab = createBottomTabNavigator<BottomTabParamList>();
const Stack = createNativeStackNavigator<RootStackParamList>();

const MapIcon = ({ color }: { color: string; focused: boolean }) => (
  <View style={{ width: 20, height: 20, justifyContent: 'center', alignItems: 'center' }}>
    <View style={{
      width: 16,
      height: 16,
      borderRadius: 8,
      borderWidth: 2,
      borderColor: color,
      justifyContent: 'center',
      alignItems: 'center',
    }}>
      <View style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: color }} />
    </View>
  </View>
);

const ListIcon = ({ color }: { color: string; focused: boolean }) => (
  <View style={{ width: 20, height: 20, justifyContent: 'space-between', paddingVertical: 4, paddingHorizontal: 1 }}>
    <View style={{ height: 2, borderRadius: 1, backgroundColor: color, width: '100%' }} />
    <View style={{ height: 2, borderRadius: 1, backgroundColor: color, width: '70%' }} />
    <View style={{ height: 2, borderRadius: 1, backgroundColor: color, width: '90%' }} />
  </View>
);

const ActivityIcon = ({ color }: { color: string; focused: boolean }) => (
  <View style={{ width: 20, height: 20, justifyContent: 'center', alignItems: 'center' }}>
    <View style={{
      width: 12,
      height: 11,
      borderTopLeftRadius: 6,
      borderTopRightRadius: 6,
      borderWidth: 2,
      borderColor: color,
      borderBottomWidth: 0,
      alignItems: 'center',
    }}>
      <View style={{
        width: 15,
        height: 2,
        backgroundColor: color,
        borderRadius: 1,
        position: 'absolute',
        bottom: 0,
      }} />
    </View>
    <View style={{
      width: 4,
      height: 2,
      backgroundColor: color,
      borderBottomLeftRadius: 2,
      borderBottomRightRadius: 2,
      marginTop: 1,
    }} />
  </View>
);

const ProfileIcon = ({ color }: { color: string; focused: boolean }) => (
  <View style={{ width: 20, height: 20, justifyContent: 'center', alignItems: 'center' }}>
    <View style={{
      width: 8,
      height: 8,
      borderRadius: 4,
      borderWidth: 2,
      borderColor: color,
      marginBottom: 2,
    }} />
    <View style={{
      width: 15,
      height: 7,
      borderTopLeftRadius: 7,
      borderTopRightRadius: 7,
      borderWidth: 2,
      borderColor: color,
      borderBottomWidth: 0,
    }} />
  </View>
);

function TabIcon({ name, focused, theme, badge }: { name: string; focused: boolean; theme: any; badge?: number }) {
  const color = focused ? theme.accent : theme.subtext;
  return (
    <View style={styles.tabIconWrapper}>
      {focused && <View style={[styles.activeIndicator, { backgroundColor: theme.accent }]} />}
      <View style={[styles.tabIcon, focused && { backgroundColor: theme.accentLight }]}>
        {name === 'Map' && <MapIcon color={color} focused={focused} />}
        {name === 'List' && <ListIcon color={color} focused={focused} />}
        {name === 'Activity' && <ActivityIcon color={color} focused={focused} />}
        {name === 'Profile' && <ProfileIcon color={color} focused={focused} />}
        {badge != null && badge > 0 && (
          <View style={[styles.badgeDot, { backgroundColor: theme.danger }]}>
            <Text style={styles.badgeDotText}>{badge > 9 ? '9+' : badge}</Text>
          </View>
        )}
      </View>
    </View>
  );
}

function MainTabs() {
  const { theme } = useTheme();
  const { activityBadge } = useBadge();
  const { t } = useLanguage();

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarLabelStyle: styles.tabLabel,
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
      <Tab.Screen name="Map" component={MapScreen} options={{ title: t('tabMap') }} />
      <Tab.Screen name="List" component={ListScreen} options={{ title: t('tabList') }} />
      <Tab.Screen name="Activity" component={ActivityScreen} options={{ title: t('tabActivity') }} />
      <Tab.Screen name="Profile" component={ProfileScreen} options={{ title: t('tabProfile') }} />
    </Tab.Navigator>
  );
}

function BannedAccountScreen() {
  const { theme } = useTheme();
  const { user, logout } = useAuth();
  const { t } = useLanguage();

  return (
    <View style={[styles.bannedContainer, { backgroundColor: theme.bg }]}>
      <View style={[styles.bannedPanel, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <Text style={styles.bannedIcon}>!</Text>
        <Text style={[styles.bannedTitle, { color: theme.text }]}>{t('bannedTitle')}</Text>
        <Text style={[styles.bannedText, { color: theme.subtext }]}>
          {user?.banReason || t('bannedText')}
        </Text>
        <Text style={[styles.bannedHint, { color: theme.subtext }]}>
          {t('bannedHint')}
        </Text>
        <Text style={[styles.logoutButton, { backgroundColor: theme.accent }]} onPress={logout}>
          {t('logoutBtnText')}
        </Text>
      </View>
    </View>
  );
}

export default function AppNavigator() {
  const { user, isLoading } = useAuth();
  const { theme, isDark } = useTheme();
  const { t } = useLanguage();
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
            <Stack.Screen name="Register" component={RegisterScreen as any} options={{ title: t('registerButton'), headerBackTitle: t('back') }} />
          </>
        ) : user.isBanned ? (
          <Stack.Screen name="Main" component={BannedAccountScreen} options={{ headerShown: false }} />
        ) : (
          <>
            <Stack.Screen name="Main" component={MainTabs} options={{ headerShown: false }} />
            <Stack.Screen name="EventDetails" component={EventDetailsScreen} options={{ title: t('detailsTitle'), headerBackTitle: t('back') }} />
            <Stack.Screen name="Chat" component={ChatScreen} options={{ headerBackTitle: t('back') }} />
            <Stack.Screen name="CreateEvent" component={CreateEventScreen} options={{ title: t('newEventTitle'), headerBackTitle: t('back') }} />
            <Stack.Screen name="Review" component={ReviewScreen} options={{ title: t('reviewSubmitBtn'), headerBackTitle: t('back') }} />
            <Stack.Screen name="UserProfile" component={UserProfileScreen} options={{ title: '', headerBackTitle: t('back') }} />
            <Stack.Screen name="EditProfile" component={EditProfileScreen} options={{ title: t('editProfileTitle'), headerBackTitle: t('back') }} />
            <Stack.Screen name="ModeratorDashboard" component={ModeratorDashboardScreen} options={{ title: t('moderationPanel'), headerBackTitle: t('back') }} />
            <Stack.Screen name="AdminDashboard" component={AdminDashboardScreen} options={{ title: t('adminPanel'), headerBackTitle: t('back') }} />
            <Stack.Screen name="EventParticipants" component={EventParticipantsScreen} options={{ title: t('participants'), headerBackTitle: t('back') }} />
            <Stack.Screen name="Friends" component={FriendsScreen} options={{ title: t('friendsLabel'), headerBackTitle: t('back') }} />
            <Stack.Screen name="Notifications" component={NotificationsScreen} options={{ title: t('notificationsTitle'), headerBackTitle: t('back') }} />
            <Stack.Screen name="AdminRoles" component={AdminRolesScreen} options={{ title: t('manageRoles'), headerBackTitle: t('back') }} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    position: 'absolute',
    left: 14,
    right: 14,
    bottom: 10,
    borderTopWidth: 1,
    borderRadius: 24,
    elevation: 10,
    shadowColor: '#101828',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.10,
    shadowRadius: 20,
    height: 70,
    paddingBottom: 9,
    paddingTop: 8,
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: '800',
    marginTop: 2,
  },
  tabIconWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    width: '100%',
    position: 'relative',
  },
  activeIndicator: {
    position: 'absolute',
    top: -8,
    width: 20,
    height: 3,
    borderBottomLeftRadius: 2,
    borderBottomRightRadius: 2,
  },
  tabIcon: {
    width: 40,
    height: 32,
    borderRadius: 13,
    justifyContent: 'center',
    alignItems: 'center',
  },
  badgeDot: {
    position: 'absolute',
    top: -2,
    right: -4,
    borderRadius: 8,
    minWidth: 15,
    height: 15,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 3,
  },
  badgeDotText: {
    fontSize: 9,
    color: '#FFF',
    fontWeight: '800',
  },
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

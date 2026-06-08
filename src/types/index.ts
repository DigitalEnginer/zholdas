export type EventCategory = 'mountains' | 'theatre' | 'restaurant' | 'sport' | 'other';

export type GenderFilter = 'all' | 'male' | 'female';

export type AppRole = 'user' | 'moderator' | 'admin';

export type EventStatus = 'active' | 'finished' | 'cancelled';

export interface Event {
  id: string;
  title: string;
  category: EventCategory;
  datetime: string;
  participantsCount: number;
  hiddenParticipantsCount?: number;
  maxParticipants: number;
  description: string;
  coordinate: { latitude: number; longitude: number };
  address?: string;
  createdBy?: string;
  joinedUserIds?: string[];
  imageUri?: string;
  isRecurring?: boolean;
  recurringLabel?: string;
  genderFilter?: GenderFilter;
  minAge?: number;
  maxAge?: number;
  status?: EventStatus;
}

export interface Message {
  id: string;
  eventId: string;
  userId: string;
  userName: string;
  text: string;
  timestamp: Date;
  isAI?: boolean;
  reactions?: Record<string, string[]>;
}

export interface User {
  id: string;
  name: string;
  username: string;
  bio: string;
  avatar: string;
  email: string;
  password: string;
  rating: number;
  reviewsCount: number;
  joinedAt: string;
  eventsJoined: number;
  friendsMade: number;
  isVerified?: boolean;
  role?: AppRole;
  isBanned?: boolean;
  banReason?: string;
  gender?: 'male' | 'female' | 'not_specified';
  birthYear?: number;
}

export interface ActivityItem {
  id: string;
  type: 'join' | 'create' | 'review' | 'near';
  userId: string;
  userName: string;
  userAvatar: string;
  eventId: string;
  eventTitle: string;
  timestamp: Date;
  extra?: string;
}

export interface Review {
  id: string;
  fromUserId: string;
  toUserId: string;
  eventId: string;
  rating: number;
  comment: string;
  timestamp: Date;
}

export type RootStackParamList = {
  Onboarding: undefined;
  Auth: undefined;
  Register: undefined;
  Main: undefined;
  Chat: { eventId: string; eventTitle: string };
  CreateEvent: undefined;
  EditProfile: undefined;
  Review: { eventId: string; eventTitle: string };
  UserProfile: { userId: string; userName: string; userAvatar: string };
  ModeratorDashboard: undefined;
  EventParticipants: { eventId: string; eventTitle: string };
  Friends: undefined;
  Notifications: undefined;
  AdminRoles: undefined;
};

export type BottomTabParamList = {
  Map: undefined;
  List: undefined;
  Activity: undefined;
  Profile: undefined;
};

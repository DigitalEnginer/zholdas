import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { User } from '../types';

export const AVATARS = ['🧑', '👩', '🧔', '👱', '🧕', '👨‍💻', '👩‍💻', '🧑‍🎨', '👩‍🎤', '🧑‍🚀'];

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  register: (name: string, email: string, password: string, avatarIndex: number, bio: string, gender: 'male' | 'female' | 'not_specified', birthYear: number) => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  updateUser: (updates: Partial<User>) => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        fetchProfile(session.user.id).finally(() => setIsLoading(false));
      } else {
        setIsLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        await fetchProfile(session.user.id);
      } else if (event === 'SIGNED_OUT') {
        setUser(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  async function fetchProfile(userId: string) {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (data) {
      setUser({
        id: data.id,
        name: data.name ?? '',
        username: data.username ?? '',
        bio: data.bio ?? '',
        avatar: data.avatar ?? '😊',
        email: data.email ?? '',
        password: '',
        rating: Number(data.rating) ?? 0,
        reviewsCount: data.reviews_count ?? 0,
        joinedAt: new Date(data.created_at).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' }),
        eventsJoined: data.events_joined ?? 0,
        friendsMade: data.friends_made ?? 0,
        isVerified: data.is_verified ?? false,
        gender: data.gender ?? 'not_specified',
        birthYear: data.birth_year ?? undefined,
      });
    }
  }

  async function register(name: string, email: string, password: string, avatarIndex: number, bio: string, gender: 'male' | 'female' | 'not_specified', birthYear: number) {
    const avatar = AVATARS[avatarIndex] ?? '😊';
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { name, avatar, bio, gender, birth_year: birthYear } },
    });
    if (error) throw new Error(error.message);
    if (data.user) {
      await supabase.from('profiles').upsert({
        id: data.user.id,
        gender,
        birth_year: birthYear,
      });
    }
  }

  async function login(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      if (error.message.includes('Invalid login credentials')) {
        throw new Error('Неверный email или пароль');
      }
      throw new Error(error.message);
    }
  }

  async function logout() {
    await supabase.auth.signOut();
  }

  async function updateUser(updates: Partial<User>) {
    if (!user) return;
    const dbUpdates: Record<string, unknown> = {};
    if (updates.name !== undefined) dbUpdates.name = updates.name;
    if (updates.bio !== undefined) dbUpdates.bio = updates.bio;
    if (updates.avatar !== undefined) dbUpdates.avatar = updates.avatar;
    if (updates.rating !== undefined) dbUpdates.rating = updates.rating;
    if (updates.reviewsCount !== undefined) dbUpdates.reviews_count = updates.reviewsCount;
    if (updates.eventsJoined !== undefined) dbUpdates.events_joined = updates.eventsJoined;
    if (updates.friendsMade !== undefined) dbUpdates.friends_made = updates.friendsMade;
    if (updates.gender !== undefined) dbUpdates.gender = updates.gender;
    if (updates.birthYear !== undefined) dbUpdates.birth_year = updates.birthYear;

    await supabase.from('profiles').update(dbUpdates).eq('id', user.id);
    setUser(prev => prev ? { ...prev, ...updates } : null);
  }

  return (
    <AuthContext.Provider value={{ user, isLoading, register, login, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);

import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';

interface BadgeContextType {
  activityBadge: number;
  clearActivityBadge: () => void;
}

const BadgeContext = createContext<BadgeContextType>({ activityBadge: 0, clearActivityBadge: () => {} });

export function BadgeProvider({ children }: { children: React.ReactNode }) {
  const [activityBadge, setActivityBadge] = useState(0);
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel(`badge-tracker-${user.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'event_participants' }, () => {
        setActivityBadge(prev => prev + 1);
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'events' }, () => {
        setActivityBadge(prev => prev + 1);
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `recipient_id=eq.${user.id}` }, () => {
        setActivityBadge(prev => prev + 1);
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'reports' }, () => {
        if (user.role === 'moderator' || user.role === 'admin') {
          setActivityBadge(prev => prev + 1);
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user?.id, user?.role]);

  return (
    <BadgeContext.Provider value={{ activityBadge, clearActivityBadge: () => setActivityBadge(0) }}>
      {children}
    </BadgeContext.Provider>
  );
}

export const useBadge = () => useContext(BadgeContext);

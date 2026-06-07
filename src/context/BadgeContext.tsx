import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

interface BadgeContextType {
  activityBadge: number;
  clearActivityBadge: () => void;
}

const BadgeContext = createContext<BadgeContextType>({ activityBadge: 0, clearActivityBadge: () => {} });

export function BadgeProvider({ children }: { children: React.ReactNode }) {
  const [activityBadge, setActivityBadge] = useState(0);

  useEffect(() => {
    const channel = supabase
      .channel('badge-tracker')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'event_participants' }, () => {
        setActivityBadge(prev => prev + 1);
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'events' }, () => {
        setActivityBadge(prev => prev + 1);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  return (
    <BadgeContext.Provider value={{ activityBadge, clearActivityBadge: () => setActivityBadge(0) }}>
      {children}
    </BadgeContext.Provider>
  );
}

export const useBadge = () => useContext(BadgeContext);

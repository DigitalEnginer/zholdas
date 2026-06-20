-- Migration: Add visibility column to events table
-- Run this in the Supabase SQL Editor.

ALTER TABLE public.events ADD COLUMN IF NOT EXISTS visibility text DEFAULT 'public';

-- Add constraint to ensure it's either 'public' or 'friends'
ALTER TABLE public.events DROP CONSTRAINT IF EXISTS check_event_visibility;
ALTER TABLE public.events ADD CONSTRAINT check_event_visibility CHECK (visibility IN ('public', 'friends'));

COMMENT ON COLUMN public.events.visibility IS 'Visibility of the event: public (visible to everyone) or friends (visible only to creator and their friends)';

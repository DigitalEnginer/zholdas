-- SQL migration to:
-- 1. Allow sending chat messages after the event is finished.
-- 2. Allow event creators and moderators/admins to delete events.
-- 3. Allow event creators, moderators, and review authors to delete reviews.
-- Run this in your Supabase SQL Editor to apply the change.

-- 1. Update can_send_chat_message function
create or replace function public.can_send_chat_message(p_event_id uuid, p_user_id text, p_text text, p_image_url text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select
    public.is_not_banned()
    and p_user_id = (select auth.uid())::text
    and length(trim(coalesce(p_text, ''))) <= 500
    and (
      length(trim(coalesce(p_text, ''))) > 0
      or p_image_url is not null
    )
    and (
      select count(*) < 20
      from public.messages recent
      where recent.user_id = (select auth.uid())::text
        and recent.created_at > now() - interval '5 minutes'
    )
    and exists (
      select 1
      from public.events e
      where e.id = p_event_id
        and e.status in ('active', 'finished')
    )
    and (
      public.is_moderator_or_admin()
      or exists (
        select 1
        from public.events e
        where e.id = p_event_id
          and e.created_by = (select auth.uid())
      )
      or exists (
        select 1
        from public.event_participants ep
        where ep.event_id = p_event_id
          and ep.user_id = (select auth.uid())
      )
    )
$$;

-- 2. Update events delete policy
drop policy if exists events_delete_creator_moderator on public.events;

create policy events_delete_creator_moderator
on public.events
for delete
to authenticated
using (
  created_by = (select auth.uid())
  or public.is_moderator_or_admin()
);

-- 3. Update reviews delete policy
drop policy if exists reviews_delete_policy on public.reviews;

create policy reviews_delete_policy
on public.reviews
for delete
to authenticated
using (
  from_user_id = (select auth.uid())
  or public.is_moderator_or_admin()
  or exists (
    select 1
    from public.events e
    where e.id = reviews.event_id
      and e.created_by = (select auth.uid())
  )
);

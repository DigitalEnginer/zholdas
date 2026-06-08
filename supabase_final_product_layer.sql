-- Final product layer for Zholdas.
-- Run after supabase_moderation_hardening.sql and supabase_social_features.sql.

alter table public.reports
add column if not exists details text;

drop policy if exists friend_requests_delete_related on public.friend_requests;

create policy friend_requests_delete_related
on public.friend_requests
for delete
to authenticated
using (
  from_user_id = (select auth.uid())
  or to_user_id = (select auth.uid())
);

drop policy if exists ep_delete on public.event_participants;
drop policy if exists ep_delete_self_creator_moderator on public.event_participants;

create policy ep_delete_self_creator_moderator
on public.event_participants
for delete
to authenticated
using (
  user_id = (select auth.uid())
  or public.is_moderator_or_admin()
  or exists (
    select 1
    from public.events e
    where e.id = event_participants.event_id
      and e.created_by = (select auth.uid())
  )
);

-- Use this stricter messages_insert only after backend/.env has SUPABASE_SERVICE_ROLE_KEY.
-- It removes frontend permission to write user_id = 'ai'.
drop policy if exists messages_insert on public.messages;

create policy messages_insert
on public.messages
for insert
to authenticated
with check (
  public.is_not_banned()
  and user_id = (select auth.uid())::text
  and exists (
    select 1
    from public.event_participants ep
    where ep.event_id = messages.event_id
      and ep.user_id = (select auth.uid())
  )
);

create or replace function public.touch_friend_request_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists friend_requests_touch_updated_at on public.friend_requests;

create trigger friend_requests_touch_updated_at
before update on public.friend_requests
for each row
execute function public.touch_friend_request_updated_at();

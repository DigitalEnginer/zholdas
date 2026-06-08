-- Moderation hardening for Zholdas.
-- Run in Supabase SQL Editor after tables profiles, user_bans, reports exist.

create table if not exists public.moderation_actions (
  id uuid primary key default gen_random_uuid(),
  moderator_id uuid references public.profiles(id) on delete set null,
  target_user_id uuid references public.profiles(id) on delete cascade,
  action text not null check (action in ('ban', 'unban', 'report_reviewed', 'report_dismissed')),
  reason text,
  created_at timestamptz not null default now()
);

alter table public.moderation_actions enable row level security;

create or replace function public.user_role(p_user_id uuid)
returns public.app_role
language sql
security definer
set search_path = public
as $$
  select role
  from public.profiles
  where id = p_user_id
$$;

create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = (select auth.uid())
      and role = 'admin'
      and is_banned = false
  )
$$;

create or replace function public.can_moderate_user(p_target_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select
    public.is_admin()
    or (
      public.is_moderator_or_admin()
      and coalesce(public.user_role(p_target_user_id), 'user'::public.app_role) = 'user'
    )
$$;

create or replace function public.can_create_report()
returns boolean
language sql
security definer
set search_path = public
as $$
  select count(*) < 5
  from public.reports
  where reporter_id = (select auth.uid())
    and created_at > now() - interval '1 hour'
$$;

drop policy if exists moderation_actions_select_moderators on public.moderation_actions;

create policy moderation_actions_select_moderators
on public.moderation_actions
for select
to authenticated
using (public.is_moderator_or_admin());

drop policy if exists user_bans_insert_moderators on public.user_bans;
drop policy if exists user_bans_delete_moderators on public.user_bans;

create policy user_bans_insert_moderators
on public.user_bans
for insert
to authenticated
with check (
  public.is_moderator_or_admin()
  and public.can_moderate_user(user_id)
  and banned_by = (select auth.uid())
);

create policy user_bans_delete_moderators
on public.user_bans
for delete
to authenticated
using (
  public.is_moderator_or_admin()
  and public.can_moderate_user(user_id)
);

drop policy if exists reports_insert on public.reports;

create policy reports_insert
on public.reports
for insert
to authenticated
with check (
  public.is_not_banned()
  and public.can_create_report()
  and reporter_id = (select auth.uid())
  and reporter_id <> reported_user_id
);

create or replace function public.log_ban_action()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.moderation_actions (moderator_id, target_user_id, action, reason)
  values (new.banned_by, new.user_id, 'ban', new.reason);

  return new;
end;
$$;

create or replace function public.log_unban_action()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.moderation_actions (moderator_id, target_user_id, action, reason)
  values ((select auth.uid()), old.user_id, 'unban', old.reason);

  return old;
end;
$$;

drop trigger if exists user_bans_log_insert on public.user_bans;
drop trigger if exists user_bans_log_delete on public.user_bans;

create trigger user_bans_log_insert
after insert on public.user_bans
for each row
execute function public.log_ban_action();

create trigger user_bans_log_delete
after delete on public.user_bans
for each row
execute function public.log_unban_action();

create or replace function public.prevent_protected_profile_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    if old.role is distinct from new.role then
      raise exception 'Only admins can change roles';
    end if;

    if old.is_banned is distinct from new.is_banned
      or old.banned_at is distinct from new.banned_at
      or old.banned_by is distinct from new.banned_by
      or old.ban_reason is distinct from new.ban_reason then
      raise exception 'Ban fields are managed by moderation actions';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_protected_fields on public.profiles;

create trigger profiles_protected_fields
before update on public.profiles
for each row
execute function public.prevent_protected_profile_changes();

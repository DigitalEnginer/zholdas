-- Super admin panel access for Zholdas.
-- Run after the base schema and moderation SQL files.
-- Replace admin@example.com before running.

create table if not exists public.super_admin_emails (
  email text primary key,
  created_at timestamptz not null default now()
);

create table if not exists public.admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id) on delete set null,
  target_user_id uuid references public.profiles(id) on delete set null,
  target_event_id uuid references public.events(id) on delete set null,
  action text not null,
  details text,
  created_at timestamptz not null default now()
);

create table if not exists public.system_settings (
  key text primary key,
  value text not null,
  description text,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.super_admin_emails (email)
values ('admin@example.com')
on conflict (email) do nothing;

insert into public.system_settings (key, value, description)
values
  ('ai_enabled', 'true', 'Enable or disable event chat AI'),
  ('ai_rate_limit_per_10m', '8', 'AI requests per user per 10 minutes'),
  ('moderation_enabled', 'true', 'Enable client and database content moderation controls'),
  ('max_event_participants_default', '10', 'Default maximum participant count for new events'),
  ('default_city', 'Almaty', 'Default city for discovery and maps')
on conflict (key) do nothing;

alter table public.super_admin_emails enable row level security;
alter table public.admin_audit_logs enable row level security;
alter table public.system_settings enable row level security;

create or replace function public.is_super_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    join public.super_admin_emails sae on lower(sae.email) = lower(p.email)
    where p.id = (select auth.uid())
      and p.role = 'admin'
      and p.is_banned = false
  )
$$;

create or replace function public.can_moderate_user(p_target_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select
    p_target_user_id <> (select auth.uid())
    and (
      (
        public.is_admin()
        and coalesce(public.user_role(p_target_user_id), 'user'::public.app_role) <> 'admin'::public.app_role
      )
      or (
        public.is_moderator_or_admin()
        and coalesce(public.user_role(p_target_user_id), 'user'::public.app_role) = 'user'::public.app_role
      )
    )
$$;

create or replace function public.prevent_admin_peer_profile_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.id <> (select auth.uid()) and old.role = 'admin'::public.app_role then
    if old.role is distinct from new.role
      or old.is_banned is distinct from new.is_banned
      or old.banned_at is distinct from new.banned_at
      or old.banned_by is distinct from new.banned_by
      or old.ban_reason is distinct from new.ban_reason then
      raise exception 'Admins cannot change other admins';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_admin_peer_guard on public.profiles;

create trigger profiles_admin_peer_guard
before update on public.profiles
for each row
execute function public.prevent_admin_peer_profile_changes();

create or replace function public.touch_system_settings_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at = now();
  new.updated_by = (select auth.uid());
  return new;
end;
$$;

drop trigger if exists system_settings_touch_updated_at on public.system_settings;

create trigger system_settings_touch_updated_at
before update on public.system_settings
for each row
execute function public.touch_system_settings_updated_at();

create or replace function public.log_admin_action(
  p_action text,
  p_target_user_id uuid default null,
  p_target_event_id uuid default null,
  p_details text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_log_id uuid;
begin
  if not public.is_super_admin() then
    raise exception 'Only super admins can write admin audit logs';
  end if;

  insert into public.admin_audit_logs (
    actor_id,
    target_user_id,
    target_event_id,
    action,
    details
  )
  values (
    (select auth.uid()),
    p_target_user_id,
    p_target_event_id,
    p_action,
    p_details
  )
  returning id into v_log_id;

  return v_log_id;
end;
$$;

create or replace function public.create_admin_broadcast(
  p_title text,
  p_body text
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if not public.is_super_admin() then
    raise exception 'Only super admins can broadcast';
  end if;

  if length(trim(coalesce(p_title, ''))) < 3 then
    raise exception 'Broadcast title is too short';
  end if;

  insert into public.notifications (recipient_id, actor_id, type, title, body)
  select id, (select auth.uid()), 'broadcast', trim(p_title), nullif(trim(coalesce(p_body, '')), '')
  from public.profiles
  where is_banned = false;

  get diagnostics v_count = row_count;

  perform public.log_admin_action(
    'broadcast_sent',
    null,
    null,
    'title:' || trim(p_title) || E'\nrecipients:' || v_count::text
  );

  return v_count;
end;
$$;

do $$
declare
  v_constraint_name text;
begin
  select conname
  into v_constraint_name
  from pg_constraint
  where conrelid = 'public.notifications'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) like '%type%'
  limit 1;

  if v_constraint_name is not null then
    execute format('alter table public.notifications drop constraint %I', v_constraint_name);
  end if;
end $$;

alter table public.notifications
add constraint notifications_type_check
check (
  type in (
    'friend_request',
    'friend_accept',
    'report_created',
    'ban',
    'unban',
    'event_joined',
    'event_left',
    'event_finished',
    'event_cancelled',
    'chat_message',
    'broadcast'
  )
);

drop policy if exists super_admin_emails_select_super_admin on public.super_admin_emails;

create policy super_admin_emails_select_super_admin
on public.super_admin_emails
for select
to authenticated
using (public.is_super_admin());

drop policy if exists admin_audit_logs_select_super_admin on public.admin_audit_logs;
drop policy if exists admin_audit_logs_insert_super_admin on public.admin_audit_logs;

create policy admin_audit_logs_select_super_admin
on public.admin_audit_logs
for select
to authenticated
using (public.is_super_admin());

create policy admin_audit_logs_insert_super_admin
on public.admin_audit_logs
for insert
to authenticated
with check (public.is_super_admin());

drop policy if exists system_settings_select_super_admin on public.system_settings;
drop policy if exists system_settings_update_super_admin on public.system_settings;

create policy system_settings_select_super_admin
on public.system_settings
for select
to authenticated
using (public.is_super_admin());

create policy system_settings_update_super_admin
on public.system_settings
for update
to authenticated
using (public.is_super_admin())
with check (public.is_super_admin());

drop policy if exists messages_select_super_admin on public.messages;
drop policy if exists messages_delete_super_admin on public.messages;

create policy messages_select_super_admin
on public.messages
for select
to authenticated
using (public.is_super_admin());

create policy messages_delete_super_admin
on public.messages
for delete
to authenticated
using (public.is_super_admin());

drop policy if exists events_delete_super_admin on public.events;
drop policy if exists events_select_super_admin on public.events;

create policy events_select_super_admin
on public.events
for select
to authenticated
using (public.is_super_admin());

create policy events_delete_super_admin
on public.events
for delete
to authenticated
using (public.is_super_admin());

drop policy if exists profiles_select_super_admin on public.profiles;
drop policy if exists profiles_update_super_admin on public.profiles;

create policy profiles_select_super_admin
on public.profiles
for select
to authenticated
using (public.is_super_admin());

create policy profiles_update_super_admin
on public.profiles
for update
to authenticated
using (public.is_super_admin())
with check (public.is_super_admin());

drop policy if exists content_violations_select_super_admin on public.content_moderation_violations;

create policy content_violations_select_super_admin
on public.content_moderation_violations
for select
to authenticated
using (public.is_super_admin());

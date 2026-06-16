-- Social features for Zholdas: friend requests, personal blocks, notifications.
-- Run in Supabase SQL Editor after profiles, reports, user_bans, moderation_actions exist.

create table if not exists public.friend_requests (
  id uuid primary key default gen_random_uuid(),
  from_user_id uuid not null references public.profiles(id) on delete cascade,
  to_user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (from_user_id, to_user_id),
  check (from_user_id <> to_user_id)
);

create table if not exists public.blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  type text not null check (type in ('friend_request', 'friend_accept', 'report_created', 'ban', 'unban')),
  title text not null,
  body text,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.friend_requests enable row level security;
alter table public.blocks enable row level security;
alter table public.notifications enable row level security;

create or replace function public.are_blocked(p_user_a uuid, p_user_b uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.blocks
    where (blocker_id = p_user_a and blocked_id = p_user_b)
       or (blocker_id = p_user_b and blocked_id = p_user_a)
  )
$$;

drop policy if exists friend_requests_select_related on public.friend_requests;
drop policy if exists friend_requests_insert_own on public.friend_requests;
drop policy if exists friend_requests_update_recipient on public.friend_requests;

create policy friend_requests_select_related
on public.friend_requests
for select
to authenticated
using (
  from_user_id = (select auth.uid())
  or to_user_id = (select auth.uid())
);

create policy friend_requests_insert_own
on public.friend_requests
for insert
to authenticated
with check (
  public.is_not_banned()
  and from_user_id = (select auth.uid())
  and from_user_id <> to_user_id
  and not public.are_blocked(from_user_id, to_user_id)
);

create policy friend_requests_update_recipient
on public.friend_requests
for update
to authenticated
using (
  to_user_id = (select auth.uid())
)
with check (
  to_user_id = (select auth.uid())
  and status in ('accepted', 'declined')
);

drop policy if exists blocks_select_own on public.blocks;
drop policy if exists blocks_insert_own on public.blocks;
drop policy if exists blocks_delete_own on public.blocks;

create policy blocks_select_own
on public.blocks
for select
to authenticated
using (
  blocker_id = (select auth.uid())
);

create policy blocks_insert_own
on public.blocks
for insert
to authenticated
with check (
  public.is_not_banned()
  and blocker_id = (select auth.uid())
  and blocker_id <> blocked_id
);

create policy blocks_delete_own
on public.blocks
for delete
to authenticated
using (
  blocker_id = (select auth.uid())
);

drop policy if exists notifications_select_own on public.notifications;
drop policy if exists notifications_update_own on public.notifications;

create policy notifications_select_own
on public.notifications
for select
to authenticated
using (
  recipient_id = (select auth.uid())
);

create policy notifications_update_own
on public.notifications
for update
to authenticated
using (
  recipient_id = (select auth.uid())
)
with check (
  recipient_id = (select auth.uid())
);

create or replace function public.notify_friend_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notifications (recipient_id, actor_id, type, title, body)
  values (new.to_user_id, new.from_user_id, 'friend_request', 'Новая заявка в друзья', 'Пользователь хочет добавить вас в друзья');

  return new;
end;
$$;

create or replace function public.notify_friend_accept()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.status = 'pending' and new.status = 'accepted' then
    insert into public.notifications (recipient_id, actor_id, type, title, body)
    values (new.from_user_id, new.to_user_id, 'friend_accept', 'Заявка принята', 'Теперь вы друзья');
  end if;

  return new;
end;
$$;

create or replace function public.notify_moderators_about_report()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reporter_name text;
  v_target_name text;
  v_category text;
  v_description text;
  v_body text;
begin
  select name into v_reporter_name
  from public.profiles
  where id = new.reporter_id;

  select name into v_target_name
  from public.profiles
  where id = new.reported_user_id;

  v_category := nullif(trim(coalesce(
    substring(coalesce(new.details, '') from '(?:^|\n)category:([^\n]+)'),
    substring(coalesce(new.details, '') from '(?:^|\n)category=([^\n]+)'),
    new.reason
  )), '');

  v_description := nullif(trim(coalesce(
    substring(coalesce(new.details, '') from '(?:^|\n)description:([^\n]+)'),
    substring(coalesce(new.details, '') from '(?:^|\n)description=([^\n]+)')
  )), '');

  v_body := concat_ws(
    E'\n',
    'На кого: ' || coalesce(v_target_name, 'Пользователь'),
    'От кого: ' || coalesce(v_reporter_name, 'Пользователь'),
    'Тип: ' || coalesce(v_category, new.reason),
    case when v_description is not null then 'Описание: ' || v_description else null end
  );

  insert into public.notifications (recipient_id, actor_id, type, title, body)
  select id, new.reporter_id, 'report_created', 'Новая жалоба', v_body
  from public.profiles
  where role in ('moderator', 'admin')
    and is_banned = false
    and id <> new.reporter_id;

  return new;
end;
$$;

create or replace function public.notify_ban_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.notifications (recipient_id, actor_id, type, title, body)
    values (new.user_id, new.banned_by, 'ban', 'Аккаунт заблокирован', new.reason);
    return new;
  end if;

  insert into public.notifications (recipient_id, actor_id, type, title, body)
  values (old.user_id, old.banned_by, 'unban', 'Аккаунт разблокирован', 'Доступ восстановлен');
  return old;
end;
$$;

create or replace function public.log_report_status_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.status = 'pending' and new.status in ('reviewed', 'dismissed') then
    insert into public.moderation_actions (moderator_id, target_user_id, action, reason)
    values (
      (select auth.uid()),
      new.reported_user_id,
      case when new.status = 'reviewed' then 'report_reviewed' else 'report_dismissed' end,
      new.reason
    );
  end if;

  return new;
end;
$$;

drop trigger if exists friend_requests_after_insert_notify on public.friend_requests;
drop trigger if exists friend_requests_after_update_notify on public.friend_requests;
drop trigger if exists reports_after_insert_notify on public.reports;
drop trigger if exists user_bans_after_insert_notify on public.user_bans;
drop trigger if exists user_bans_after_delete_notify on public.user_bans;
drop trigger if exists reports_after_update_log on public.reports;

create trigger friend_requests_after_insert_notify
after insert on public.friend_requests
for each row
execute function public.notify_friend_request();

create trigger friend_requests_after_update_notify
after update on public.friend_requests
for each row
execute function public.notify_friend_accept();

create trigger reports_after_insert_notify
after insert on public.reports
for each row
execute function public.notify_moderators_about_report();

create trigger user_bans_after_insert_notify
after insert on public.user_bans
for each row
execute function public.notify_ban_change();

create trigger user_bans_after_delete_notify
after delete on public.user_bans
for each row
execute function public.notify_ban_change();

create trigger reports_after_update_log
after update on public.reports
for each row
execute function public.log_report_status_update();

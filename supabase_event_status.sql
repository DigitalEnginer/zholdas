-- Event status lifecycle for Zholdas.
-- Run after base tables and moderation hardening are in place.

alter table public.events
add column if not exists status text not null default 'active';

alter table public.events
add column if not exists cancel_reason text;

alter table public.events
add column if not exists starts_at timestamptz;

alter table public.events
add column if not exists updated_at timestamptz not null default now();

alter table public.messages
add column if not exists image_url text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'events_status_check'
      and conrelid = 'public.events'::regclass
  ) then
    alter table public.events
    add constraint events_status_check
    check (status in ('active', 'finished', 'cancelled'));
  end if;
end $$;

update public.events
set status = 'active'
where status is null;

create or replace function public.touch_event_updated_at()
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

drop trigger if exists events_touch_updated_at on public.events;

create trigger events_touch_updated_at
before update on public.events
for each row
execute function public.touch_event_updated_at();

create or replace function public.can_manage_event(p_event_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select
    public.is_moderator_or_admin()
    or exists (
      select 1
      from public.events e
      where e.id = p_event_id
        and e.created_by = (select auth.uid())
    )
$$;

create or replace function public.set_event_status(
  p_event_id uuid,
  p_status text,
  p_cancel_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_status not in ('active', 'finished', 'cancelled') then
    raise exception 'Invalid event status';
  end if;

  if not public.can_manage_event(p_event_id) then
    raise exception 'Only event creator, moderator, or admin can change event status';
  end if;

  update public.events
  set
    status = p_status,
    cancel_reason = case
      when p_status = 'cancelled' then nullif(trim(coalesce(p_cancel_reason, '')), '')
      when p_status = 'active' then null
      else cancel_reason
    end
  where id = p_event_id;
end;
$$;

create or replace function public.finish_past_events()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  update public.events
  set status = 'finished'
  where status = 'active'
    and starts_at is not null
    and starts_at < now();

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

drop policy if exists events_update on public.events;
drop policy if exists events_update_creator_moderator on public.events;

create policy events_update_creator_moderator
on public.events
for update
to authenticated
using (public.can_manage_event(id))
with check (public.can_manage_event(id));

create or replace function public.join_event(p_event_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_max_participants integer;
  v_participants_count integer;
begin
  if p_user_id <> (select auth.uid()) then
    raise exception 'User mismatch';
  end if;

  if not public.is_not_banned() then
    raise exception 'User is banned';
  end if;

  perform public.finish_past_events();

  select status, max_participants
  into v_status, v_max_participants
  from public.events
  where id = p_event_id;

  if not found then
    raise exception 'Event not found';
  end if;

  if v_status <> 'active' then
    raise exception 'Only active events can be joined';
  end if;

  select count(*)::integer
  into v_participants_count
  from public.event_participants
  where event_id = p_event_id;

  if v_participants_count >= v_max_participants then
    raise exception 'Event is full';
  end if;

  insert into public.event_participants (event_id, user_id)
  values (p_event_id, p_user_id)
  on conflict do nothing;

  update public.events
  set participants_count = (
    select count(*)::integer
    from public.event_participants
    where event_id = p_event_id
  )
  where id = p_event_id;
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
    'chat_message'
  )
);

create or replace function public.notify_event_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.status is not distinct from new.status then
    return new;
  end if;

  if new.status = 'finished' then
    insert into public.notifications (recipient_id, actor_id, type, title, body)
    select ep.user_id, (select auth.uid()), 'event_finished', 'Ивент завершен', new.title
    from public.event_participants ep
    where ep.event_id = new.id;
  elsif new.status = 'cancelled' then
    insert into public.notifications (recipient_id, actor_id, type, title, body)
    select ep.user_id, (select auth.uid()), 'event_cancelled', 'Ивент отменен', coalesce(new.cancel_reason, new.title)
    from public.event_participants ep
    where ep.event_id = new.id;
  end if;

  return new;
end;
$$;

drop trigger if exists events_after_status_update_notify on public.events;

create trigger events_after_status_update_notify
after update of status on public.events
for each row
execute function public.notify_event_status_change();

create or replace function public.notify_event_participant_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_creator_id uuid;
  v_event_title text;
begin
  select created_by, title
  into v_creator_id, v_event_title
  from public.events
  where id = new.event_id;

  if v_creator_id is not null and v_creator_id <> new.user_id then
    insert into public.notifications (recipient_id, actor_id, type, title, body)
    values (v_creator_id, new.user_id, 'event_joined', 'Новый участник', v_event_title);
  end if;

  return new;
end;
$$;

create or replace function public.notify_event_participant_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_creator_id uuid;
  v_event_title text;
begin
  select created_by, title
  into v_creator_id, v_event_title
  from public.events
  where id = old.event_id;

  if v_creator_id is not null and v_creator_id <> old.user_id then
    insert into public.notifications (recipient_id, actor_id, type, title, body)
    values (v_creator_id, old.user_id, 'event_left', 'Участник вышел', v_event_title);
  end if;

  return old;
end;
$$;

drop trigger if exists event_participants_after_insert_notify on public.event_participants;
drop trigger if exists event_participants_after_delete_notify on public.event_participants;

create trigger event_participants_after_insert_notify
after insert on public.event_participants
for each row
execute function public.notify_event_participant_insert();

create trigger event_participants_after_delete_notify
after delete on public.event_participants
for each row
execute function public.notify_event_participant_delete();

create or replace function public.notify_chat_message_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event_title text;
begin
  if new.user_id = 'ai' then
    return new;
  end if;

  select title
  into v_event_title
  from public.events
  where id = new.event_id;

  insert into public.notifications (recipient_id, actor_id, type, title, body)
  select ep.user_id, new.user_id::uuid, 'chat_message', 'Новое сообщение', coalesce(v_event_title, 'Чат ивента')
  from public.event_participants ep
  join public.profiles p on p.id = ep.user_id
  where ep.event_id = new.event_id
    and ep.user_id::text <> new.user_id
    and p.is_banned = false;

  return new;
end;
$$;

drop trigger if exists messages_after_insert_notify on public.messages;

create trigger messages_after_insert_notify
after insert on public.messages
for each row
execute function public.notify_chat_message_insert();

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
        and e.status = 'active'
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

drop policy if exists messages_insert on public.messages;

create policy messages_insert
on public.messages
for insert
to authenticated
with check (
  public.can_send_chat_message(event_id, user_id, text, image_url)
);

drop policy if exists messages_delete_moderator_creator on public.messages;

create policy messages_delete_moderator_creator
on public.messages
for delete
to authenticated
using (
  public.is_moderator_or_admin()
  or exists (
    select 1
    from public.events e
    where e.id = messages.event_id
      and e.created_by = (select auth.uid())
  )
);

create or replace function public.leave_event(p_event_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user_id <> (select auth.uid()) then
    raise exception 'User mismatch';
  end if;

  delete from public.event_participants
  where event_id = p_event_id
    and user_id = p_user_id;

  update public.events
  set participants_count = (
    select count(*)::integer
    from public.event_participants
    where event_id = p_event_id
  )
  where id = p_event_id;
end;
$$;

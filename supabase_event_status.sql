-- Event status lifecycle for Zholdas.
-- Run after base tables and moderation hardening are in place.

alter table public.events
add column if not exists status text not null default 'active';

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

create or replace function public.set_event_status(p_event_id uuid, p_status text)
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
  set status = p_status
  where id = p_event_id;
end;
$$;

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


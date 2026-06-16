-- Auto-finish event lifecycle hardening for Zholdas.
-- Run this in Supabase SQL Editor after supabase_event_status.sql.

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

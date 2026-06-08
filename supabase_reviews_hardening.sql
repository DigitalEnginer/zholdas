-- Reviews and rating hardening for Zholdas.
-- Run after base tables, RLS policies, and moderation hardening are in place.

delete from public.reviews r
using public.reviews newer
where r.from_user_id = newer.from_user_id
  and r.to_user_id = newer.to_user_id
  and r.event_id = newer.event_id
  and (
    coalesce(newer.created_at, 'epoch'::timestamptz) > coalesce(r.created_at, 'epoch'::timestamptz)
    or (
      coalesce(newer.created_at, 'epoch'::timestamptz) = coalesce(r.created_at, 'epoch'::timestamptz)
      and newer.id > r.id
    )
  );

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'reviews_unique_per_event'
      and conrelid = 'public.reviews'::regclass
  ) then
    alter table public.reviews
    add constraint reviews_unique_per_event
    unique (from_user_id, to_user_id, event_id);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'reviews_no_self_review'
      and conrelid = 'public.reviews'::regclass
  ) then
    alter table public.reviews
    add constraint reviews_no_self_review
    check (from_user_id <> to_user_id);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'reviews_rating_range'
      and conrelid = 'public.reviews'::regclass
  ) then
    alter table public.reviews
    add constraint reviews_rating_range
    check (rating between 1 and 5);
  end if;
end $$;

create or replace function public.can_review_event_participant(
  p_from_user_id uuid,
  p_to_user_id uuid,
  p_event_id uuid
)
returns boolean
language sql
security definer
set search_path = public
as $$
  select
    p_from_user_id = (select auth.uid())
    and p_from_user_id <> p_to_user_id
    and public.is_not_banned()
    and exists (
      select 1
      from public.events e
      where e.id = p_event_id
        and e.status = 'finished'
    )
    and exists (
      select 1
      from public.event_participants ep
      where ep.event_id = p_event_id
        and ep.user_id = p_from_user_id
    )
    and exists (
      select 1
      from public.event_participants ep
      join public.profiles p on p.id = ep.user_id
      where ep.event_id = p_event_id
        and ep.user_id = p_to_user_id
        and p.is_banned = false
    )
$$;

drop policy if exists reviews_insert on public.reviews;
drop policy if exists reviews_insert_participants_only on public.reviews;

create policy reviews_insert_participants_only
on public.reviews
for insert
to authenticated
with check (
  public.can_review_event_participant(from_user_id, to_user_id, event_id)
);

create or replace function public.recalculate_profile_rating(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_avg numeric;
  v_count integer;
begin
  select
    coalesce(round(avg(rating)::numeric, 1), 0),
    count(*)::integer
  into v_avg, v_count
  from public.reviews
  where to_user_id = p_user_id;

  update public.profiles
  set
    rating = v_avg,
    reviews_count = v_count
  where id = p_user_id;
end;
$$;

create or replace function public.recalculate_profile_rating_after_review()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    perform public.recalculate_profile_rating(old.to_user_id);
    return old;
  end if;

  perform public.recalculate_profile_rating(new.to_user_id);

  if tg_op = 'UPDATE' and old.to_user_id is distinct from new.to_user_id then
    perform public.recalculate_profile_rating(old.to_user_id);
  end if;

  return new;
end;
$$;

drop trigger if exists reviews_recalculate_profile_rating on public.reviews;

create trigger reviews_recalculate_profile_rating
after insert or update or delete on public.reviews
for each row
execute function public.recalculate_profile_rating_after_review();

do $$
declare
  v_profile_id uuid;
begin
  for v_profile_id in select id from public.profiles loop
    perform public.recalculate_profile_rating(v_profile_id);
  end loop;
end $$;

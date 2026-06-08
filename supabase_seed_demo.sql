-- Demo seed for Zholdas.
-- Run after the main schema/RLS files and after at least one real user has registered.
-- This script is idempotent for its fixed demo rows.

do $$
declare
  v_owner uuid;
  v_second_user uuid;
  v_admin_exists boolean;
begin
  select id
  into v_owner
  from public.profiles
  order by created_at nulls last, id
  limit 1;

  if v_owner is null then
    raise notice 'No profiles found. Register at least one user first, then run this seed again.';
    return;
  end if;

  select id
  into v_second_user
  from public.profiles
  where id <> v_owner
  order by created_at nulls last, id
  limit 1;

  select exists (
    select 1
    from public.profiles
    where role in ('admin', 'moderator')
  )
  into v_admin_exists;

  if not v_admin_exists then
    update public.profiles
    set role = 'admin'
    where id = v_owner;

    raise notice 'Promoted first profile % to admin for demo access.', v_owner;
  end if;

  insert into public.events (
    id,
    title,
    category,
    datetime,
    participants_count,
    max_participants,
    description,
    latitude,
    longitude,
    address,
    created_by,
    image_uri,
    is_recurring,
    recurring_label,
    gender_filter,
    min_age,
    max_age,
    status
  )
  values
    (
      '11111111-1111-4111-8111-111111111111',
      'Поход в горы Алатау',
      'mountains',
      'Суббота, 9:00',
      1,
      12,
      'Легкий групповой поход для знакомства и прогулки на свежем воздухе. Возьмите воду, удобную обувь и перекус.',
      43.1526,
      76.9868,
      'Кок-Жайляу, Алматы',
      v_owner,
      null,
      false,
      null,
      'all',
      null,
      null,
      'finished'
    ),
    (
      '22222222-2222-4222-8222-222222222222',
      'Ужин в Шашлык House',
      'restaurant',
      'Сегодня, 19:00',
      1,
      8,
      'Встреча за ужином для спокойного общения. Каждый оплачивает свой заказ.',
      43.2389,
      76.8897,
      'Алматы, центр',
      v_owner,
      null,
      false,
      null,
      'all',
      null,
      null,
      'active'
    ),
    (
      '33333333-3333-4333-8333-333333333333',
      'Футбол на Атакенте',
      'sport',
      'Воскресенье, 10:00',
      1,
      14,
      'Дружеский футбол без жесткого уровня. Главное - прийти вовремя и играть спокойно.',
      43.2243,
      76.9058,
      'Атакент, Алматы',
      v_owner,
      null,
      true,
      'Каждое воскресенье',
      'all',
      null,
      null,
      'active'
    )
  on conflict (id) do update
  set
    title = excluded.title,
    category = excluded.category,
    datetime = excluded.datetime,
    max_participants = excluded.max_participants,
    description = excluded.description,
    latitude = excluded.latitude,
    longitude = excluded.longitude,
    address = excluded.address,
    created_by = excluded.created_by,
    is_recurring = excluded.is_recurring,
    recurring_label = excluded.recurring_label,
    gender_filter = excluded.gender_filter,
    min_age = excluded.min_age,
    max_age = excluded.max_age,
    status = excluded.status;

  insert into public.event_participants (event_id, user_id)
  values
    ('11111111-1111-4111-8111-111111111111', v_owner),
    ('22222222-2222-4222-8222-222222222222', v_owner),
    ('33333333-3333-4333-8333-333333333333', v_owner)
  on conflict do nothing;

  if v_second_user is not null then
    insert into public.event_participants (event_id, user_id)
    values
      ('11111111-1111-4111-8111-111111111111', v_second_user),
      ('22222222-2222-4222-8222-222222222222', v_second_user)
    on conflict do nothing;

    insert into public.friend_requests (
      from_user_id,
      to_user_id,
      status
    )
    values (
      v_owner,
      v_second_user,
      'accepted'
    )
    on conflict (from_user_id, to_user_id) do update
    set status = 'accepted', updated_at = now();

    insert into public.reviews (
      id,
      from_user_id,
      to_user_id,
      event_id,
      rating,
      comment
    )
    values (
      '44444444-4444-4444-8444-444444444444',
      v_owner,
      v_second_user,
      '11111111-1111-4111-8111-111111111111',
      5,
      'Отличный участник, пришел вовремя и помог группе.'
    )
    on conflict (id) do update
    set rating = excluded.rating, comment = excluded.comment;
  end if;

  insert into public.messages (
    id,
    event_id,
    user_id,
    user_name,
    text,
    is_ai
  )
  values
    (
      '55555555-5555-4555-8555-555555555555',
      '11111111-1111-4111-8111-111111111111',
      v_owner::text,
      coalesce((select name from public.profiles where id = v_owner), 'Demo user'),
      'Привет! Кто идет в горы в субботу?',
      false
    ),
    (
      '66666666-6666-4666-8666-666666666666',
      '11111111-1111-4111-8111-111111111111',
      'ai',
      'Жолдас AI',
      'Для похода лучше взять воду, удобную обувь и легкий перекус.',
      true
    )
  on conflict (id) do update
  set text = excluded.text, user_name = excluded.user_name, is_ai = excluded.is_ai;

  raise notice 'Demo seed completed. Owner profile: %, second profile: %', v_owner, v_second_user;
end $$;

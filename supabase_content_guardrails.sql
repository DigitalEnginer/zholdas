-- Content guardrails for event titles/descriptions and event chat.
-- Run after supabase_moderation_hardening.sql and supabase_final_product_layer.sql.

create table if not exists public.content_moderation_violations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade,
  event_id uuid references public.events(id) on delete cascade,
  content_type text not null check (content_type in ('event', 'message')),
  content_id uuid,
  reason text not null,
  sample text,
  auto_ban_applied boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.content_moderation_violations enable row level security;

drop policy if exists content_violations_select_moderators on public.content_moderation_violations;
drop policy if exists content_violations_select_own on public.content_moderation_violations;

create policy content_violations_select_moderators
on public.content_moderation_violations
for select
to authenticated
using (public.is_moderator_or_admin());

create policy content_violations_select_own
on public.content_moderation_violations
for select
to authenticated
using (user_id = (select auth.uid()));

create or replace function public.content_guardrail_reason(p_text text)
returns text
language plpgsql
immutable
as $$
declare
  v_text text := lower(coalesce(p_text, ''));
begin
  if v_text ~* '(https?://|www\.|t\.me/|wa\.me/|bit\.ly/)' then
    return 'external_links_or_spam';
  end if;

  if v_text ~* '\m(бля+|сука+|хуй|хуе|пизд|еба|ёба|нахуй|долбо|мраз)\w*' then
    return 'profanity_or_insults';
  end if;

  if v_text ~* '\m(наркот|заклад|меф|соль|кокаин|героин|спайс)\w*' then
    return 'illegal_substances';
  end if;

  if v_text ~* '\m(интим|эскорт|проститут|порно|18\+)\w*' then
    return 'sexual_content';
  end if;

  if v_text ~* '\m(убить|зареж|изнасил|террор|экстрем)\w*' then
    return 'violence_or_extremism';
  end if;

  if v_text ~* '([!?.@$#%^&*_=+~].*){8,}' or v_text ~* '(.)\1{5,}' then
    return 'spam_or_noise';
  end if;

  return null;
end;
$$;

create or replace function public.record_content_violation(
  p_user_id uuid,
  p_event_id uuid,
  p_content_type text,
  p_content_id uuid,
  p_reason text,
  p_sample text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_violation_count integer;
  v_banned_by_nullable boolean;
  v_reported_user_id uuid;
  v_violation_id uuid;
begin
  insert into public.content_moderation_violations (
    user_id,
    event_id,
    content_type,
    content_id,
    reason,
    sample
  )
  values (
    p_user_id,
    p_event_id,
    p_content_type,
    p_content_id,
    p_reason,
    left(coalesce(p_sample, ''), 500)
  )
  returning id into v_violation_id;

  select count(*)::integer
  into v_violation_count
  from public.content_moderation_violations
  where user_id = p_user_id
    and created_at > now() - interval '24 hours';

  insert into public.reports (
    reporter_id,
    reported_user_id,
    reason,
    details
  )
  select
    moderator.id,
    p_user_id,
    'Автомодерация: ' || p_reason,
    concat_ws(
      E'\n',
      'type:auto_content_moderation',
      'content_type:' || p_content_type,
      'event_id:' || coalesce(p_event_id::text, ''),
      'content_id:' || coalesce(p_content_id::text, ''),
      'violation_id:' || v_violation_id::text,
      'sample:' || left(coalesce(p_sample, ''), 500)
    )
  from public.profiles moderator
  where moderator.role in ('moderator', 'admin')
    and moderator.is_banned = false
    and moderator.id <> p_user_id
  order by case when moderator.role = 'admin' then 0 else 1 end, moderator.created_at asc
  limit 1;

  if v_violation_count >= 3 and not exists (
    select 1 from public.user_bans where user_id = p_user_id
  ) then
    select is_nullable = 'YES'
    into v_banned_by_nullable
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'user_bans'
      and column_name = 'banned_by';

    if coalesce(v_banned_by_nullable, false) then
      insert into public.user_bans (user_id, banned_by, reason)
      values (
        p_user_id,
        null,
        'Автобан: 3 нарушения правил контента за 24 часа'
      );

      update public.content_moderation_violations
      set auto_ban_applied = true
      where id = v_violation_id;
    end if;
  end if;
end;
$$;

create or replace function public.enforce_event_content_guardrails()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reason text;
  v_user_id uuid := coalesce(new.created_by, (select auth.uid()));
begin
  if length(trim(coalesce(new.title, ''))) < 4 then
    raise exception 'Event content violates Zholdas community rules';
  end if;

  v_reason := public.content_guardrail_reason(concat_ws(' ', new.title, new.description));
  if v_reason is not null then
    perform public.record_content_violation(
      v_user_id,
      new.id,
      'event',
      new.id,
      v_reason,
      concat_ws(' ', new.title, new.description)
    );
    raise exception 'Event content violates Zholdas community rules';
  end if;

  return new;
end;
$$;

drop trigger if exists events_content_guardrails on public.events;

create trigger events_content_guardrails
before insert or update of title, description on public.events
for each row
execute function public.enforce_event_content_guardrails();

create or replace function public.enforce_message_content_guardrails()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reason text;
begin
  if new.user_id = 'ai' then
    return new;
  end if;

  v_reason := public.content_guardrail_reason(new.text);
  if v_reason is not null then
    perform public.record_content_violation(
      nullif(new.user_id, '')::uuid,
      new.event_id,
      'message',
      new.id,
      v_reason,
      new.text
    );
    raise exception 'Content violates Zholdas community rules';
  end if;

  return new;
end;
$$;

drop trigger if exists messages_content_guardrails on public.messages;

create trigger messages_content_guardrails
before insert or update of text on public.messages
for each row
execute function public.enforce_message_content_guardrails();

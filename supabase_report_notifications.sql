-- Report notifications for moderators/admins.
-- Run this in Supabase SQL Editor after reports, profiles and notifications exist.

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

drop trigger if exists reports_after_insert_notify on public.reports;

create trigger reports_after_insert_notify
after insert on public.reports
for each row
execute function public.notify_moderators_about_report();

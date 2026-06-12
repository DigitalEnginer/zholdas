-- Super admin panel access for Zholdas.
-- Run after the base schema and moderation SQL files.
-- Replace admin@example.com before running.

create table if not exists public.super_admin_emails (
  email text primary key,
  created_at timestamptz not null default now()
);

insert into public.super_admin_emails (email)
values ('admin@example.com')
on conflict (email) do nothing;

alter table public.super_admin_emails enable row level security;

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

drop policy if exists super_admin_emails_select_super_admin on public.super_admin_emails;

create policy super_admin_emails_select_super_admin
on public.super_admin_emails
for select
to authenticated
using (public.is_super_admin());

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

-- Supabase Storage buckets and policies for Zholdas photos.
-- Run in Supabase SQL Editor before uploading profile/event photos.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('profile-photos', 'profile-photos', true, 5242880, array['image/jpeg', 'image/png', 'image/webp']),
  ('event-photos', 'event-photos', true, 8388608, array['image/jpeg', 'image/png', 'image/webp']),
  ('chat-photos', 'chat-photos', true, 8388608, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists profile_photos_public_read on storage.objects;
drop policy if exists profile_photos_insert_own on storage.objects;
drop policy if exists profile_photos_update_own on storage.objects;
drop policy if exists profile_photos_delete_own on storage.objects;

create policy profile_photos_public_read
on storage.objects
for select
to public
using (bucket_id = 'profile-photos');

create policy profile_photos_insert_own
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'profile-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy profile_photos_update_own
on storage.objects
for update
to authenticated
using (
  bucket_id = 'profile-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
)
with check (
  bucket_id = 'profile-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy profile_photos_delete_own
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'profile-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists event_photos_public_read on storage.objects;
drop policy if exists event_photos_insert_own on storage.objects;
drop policy if exists event_photos_update_own on storage.objects;
drop policy if exists event_photos_delete_own on storage.objects;

create policy event_photos_public_read
on storage.objects
for select
to public
using (bucket_id = 'event-photos');

create policy event_photos_insert_own
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'event-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy event_photos_update_own
on storage.objects
for update
to authenticated
using (
  bucket_id = 'event-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
)
with check (
  bucket_id = 'event-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy event_photos_delete_own
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'event-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists chat_photos_public_read on storage.objects;
drop policy if exists chat_photos_insert_own on storage.objects;
drop policy if exists chat_photos_update_own on storage.objects;
drop policy if exists chat_photos_delete_own on storage.objects;

create policy chat_photos_public_read
on storage.objects
for select
to public
using (bucket_id = 'chat-photos');

create policy chat_photos_insert_own
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'chat-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy chat_photos_update_own
on storage.objects
for update
to authenticated
using (
  bucket_id = 'chat-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
)
with check (
  bucket_id = 'chat-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy chat_photos_delete_own
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'chat-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

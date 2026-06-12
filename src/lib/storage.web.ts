import { supabase } from './supabase';

type UploadImageOptions = {
  bucket: 'profile-photos' | 'event-photos' | 'chat-photos';
  path: string;
  uri: string;
};

function extensionFromUri(uri: string) {
  const cleanUri = uri.split('?')[0].split('#')[0];
  const ext = cleanUri.split('.').pop()?.toLowerCase();
  return ext && ['jpg', 'jpeg', 'png', 'webp'].includes(ext) ? ext : 'jpg';
}

function contentTypeFromExtension(ext: string) {
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  return 'image/jpeg';
}

export function isImageUrl(value?: string | null) {
  return !!value && /^https?:\/\//i.test(value);
}

function getStoragePath(publicUrl: string, bucket: UploadImageOptions['bucket']) {
  const marker = `/storage/v1/object/public/${bucket}/`;
  const [, path] = publicUrl.split(marker);
  return path ? decodeURIComponent(path.split('?')[0]) : null;
}

export async function uploadImageToStorage({ bucket, path, uri }: UploadImageOptions) {
  const ext = extensionFromUri(uri);
  const filePath = `${path}.${ext}`;
  const response = await fetch(uri);
  const blob = await response.blob();

  const { error } = await supabase.storage
    .from(bucket)
    .upload(filePath, blob, {
      contentType: blob.type || contentTypeFromExtension(ext),
      upsert: true,
    });

  if (error) throw new Error(error.message);

  const { data } = supabase.storage.from(bucket).getPublicUrl(filePath);
  return data.publicUrl;
}

export async function deletePublicStorageImage(bucket: UploadImageOptions['bucket'], publicUrl?: string | null) {
  if (!publicUrl || !isImageUrl(publicUrl)) return;
  const path = getStoragePath(publicUrl, bucket);
  if (!path) return;
  await supabase.storage.from(bucket).remove([path]);
}

import * as FileSystem from 'expo-file-system';
import { decode } from 'base64-arraybuffer';
import { supabase } from './supabase';

type UploadImageOptions = {
  bucket: 'profile-photos' | 'event-photos';
  path: string;
  uri: string;
};

function extensionFromUri(uri: string) {
  const cleanUri = uri.split('?')[0];
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

export async function uploadImageToStorage({ bucket, path, uri }: UploadImageOptions) {
  const ext = extensionFromUri(uri);
  const filePath = `${path}.${ext}`;
  const base64 = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' as any });
  const { error } = await supabase.storage
    .from(bucket)
    .upload(filePath, decode(base64), {
      contentType: contentTypeFromExtension(ext),
      upsert: true,
    });

  if (error) throw new Error(error.message);

  const { data } = supabase.storage.from(bucket).getPublicUrl(filePath);
  return data.publicUrl;
}

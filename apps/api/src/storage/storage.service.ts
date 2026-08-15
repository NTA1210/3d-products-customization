import { Injectable } from '@nestjs/common';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { requiredEnv } from '../config';

function splitKey(key: string) {
  const separator = key.lastIndexOf('/');
  return separator < 0
    ? { directory: '', filename: key }
    : { directory: key.slice(0, separator), filename: key.slice(separator + 1) };
}

@Injectable()
export class StorageService {
  private readonly bucket = requiredEnv('SUPABASE_STORAGE_BUCKET', 'product3d-assets');
  private readonly client: SupabaseClient = createClient(
    requiredEnv('SUPABASE_URL'),
    requiredEnv('SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } },
  );

  async createUploadUrl(key: string, _contentType: string) {
    const { data, error } = await this.client.storage
      .from(this.bucket)
      .createSignedUploadUrl(key, { upsert: false });
    if (error) throw error;
    return data.signedUrl;
  }

  async createDownloadUrl(key: string, expiresInSeconds = 900) {
    const { data, error } = await this.client.storage
      .from(this.bucket)
      .createSignedUrl(key, expiresInSeconds);
    if (error) throw error;
    return data.signedUrl;
  }

  async assertObjectExists(key: string) {
    const { directory, filename } = splitKey(key);
    const { data, error } = await this.client.storage
      .from(this.bucket)
      .list(directory, { search: filename, limit: 100 });
    if (error) throw error;
    if (!data.some((object) => object.name === filename)) {
      throw new Error(`Storage object not found: ${key}`);
    }
  }

  objectUri(key: string) {
    return `supabase://${this.bucket}/${key}`;
  }
}

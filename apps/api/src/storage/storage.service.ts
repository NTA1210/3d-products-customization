import { Injectable } from '@nestjs/common';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { requiredEnv } from '../config';

function createAdminClient(): SupabaseClient {
  return createClient(requiredEnv('SUPABASE_URL'), requiredEnv('SUPABASE_SECRET_KEY'), {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

@Injectable()
export class StorageService {
  private readonly bucket = requiredEnv('SUPABASE_STORAGE_BUCKET', 'product3d');
  private readonly client = createAdminClient();

  async createUploadGrant(key: string) {
    const { data, error } = await this.client.storage
      .from(this.bucket)
      .createSignedUploadUrl(key, { upsert: false });
    if (error || !data) throw error ?? new Error('Supabase did not return a signed upload token.');
    return {
      bucket: this.bucket,
      path: data.path,
      token: data.token,
      signedUrl: data.signedUrl,
      expiresInSeconds: 7200,
    };
  }

  async createDownloadUrl(key: string, expiresInSeconds = 900) {
    const { data, error } = await this.client.storage.from(this.bucket).createSignedUrl(key, expiresInSeconds);
    if (error || !data) throw error ?? new Error('Supabase did not return a signed download URL.');
    return data.signedUrl;
  }

  async assertObjectExists(key: string) {
    const { data, error } = await this.client.storage.from(this.bucket).exists(key);
    if (error) throw error;
    if (!data) throw new Error(`Supabase object does not exist: ${key}`);
  }

  objectUri(key: string) {
    return `supabase://${this.bucket}/${key}`;
  }
}

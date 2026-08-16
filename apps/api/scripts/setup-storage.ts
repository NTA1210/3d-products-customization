import { createClient } from '@supabase/supabase-js';
import process from 'process';

async function main() {
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SECRET_KEY, bucket = process.env.SUPABASE_STORAGE_BUCKET ?? 'product3d';
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SECRET_KEY are required.');
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const maxBytes = Number(process.env.MAX_ASSET_BYTES ?? 262144000);
  const existing = await client.storage.listBuckets(); if (existing.error) throw existing.error;
  const found = existing.data.find(item => item.id === bucket || item.name === bucket);
  if (!found) {
    let created = await client.storage.createBucket(bucket, { public: false, fileSizeLimit: maxBytes });
    if (created.error && (created.error.message.includes('exceeded the maximum allowed size') || (created.error as any).status === 400 || (created.error as any).statusCode === '413')) {
      console.warn(`Could not set fileSizeLimit to ${maxBytes} bytes. Retrying with 50MB limit...`);
      created = await client.storage.createBucket(bucket, { public: false, fileSizeLimit: 52428800 });
    }
    if (created.error) throw created.error;
    console.info(`Created private Supabase Storage bucket: ${bucket}`);
  } else {
    let updated = await client.storage.updateBucket(bucket, { public: false, fileSizeLimit: maxBytes });
    if (updated.error && (updated.error.message.includes('exceeded the maximum allowed size') || (updated.error as any).status === 400 || (updated.error as any).statusCode === '413')) {
      console.warn(`Could not set fileSizeLimit to ${maxBytes} bytes. Retrying with 50MB limit...`);
      updated = await client.storage.updateBucket(bucket, { public: false, fileSizeLimit: 52428800 });
    }
    if (updated.error) throw updated.error;
    console.info(`Verified private Supabase Storage bucket: ${bucket}`);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});


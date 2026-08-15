-- Run once in the Supabase SQL editor for the Storage project.
-- The bucket is private; the application API issues signed upload/download URLs.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'product3d-assets',
  'product3d-assets',
  false,
  262144000,
  array['model/gltf-binary', 'application/octet-stream']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Browser users do not receive the service-role key and therefore do not need
-- direct RLS policies for this bucket. Signed upload/download URLs are created
-- by the NestJS API using the server-only service-role key.

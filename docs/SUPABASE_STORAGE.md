# Supabase Storage setup

Phase 1 stores original and generated GLB artifacts in a **private Supabase Storage bucket**. PostgreSQL stores only metadata, configuration and object keys.

## 1. Create/configure the bucket

Run `supabase/storage.sql` in the Supabase SQL editor. The default bucket is `product3d-assets` and accepts GLB MIME types only.

If the business upload limit changes, update both the bucket `file_size_limit` and `ASSET_MAX_UPLOAD_BYTES`.

## 2. Server environment

Set these values on the NestJS API and every storage-capable worker:

```env
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<server-only-key>
SUPABASE_STORAGE_BUCKET=product3d-assets
```

Never expose `SUPABASE_SERVICE_ROLE_KEY` through `NEXT_PUBLIC_*` variables or browser bundles.

## 3. Upload flow

1. Browser calls `POST /api/assets/import` with GLB metadata.
2. API creates an immutable object key and a Supabase signed upload URL.
3. Browser uploads the GLB directly to Supabase Storage.
4. Browser calls `POST /api/assets/:id/analyze`.
5. API verifies the object exists and enqueues BullMQ processing.
6. Worker downloads the immutable source with the service-role client, validates and normalizes it, then writes a new normalized object key.
7. API issues short-lived signed download URLs when the editor/export flow needs an object.

## 4. Object layout

```text
product3d-assets/
  assets/<assetId>/source/<sanitized-original-name>.glb
  assets/<assetId>/normalized/model.glb
  exports/<projectId>/<jobId>/...
  renders/<projectId>/<jobId>/...
  ai/<projectId>/<requestId>/...
```

Original source objects are never overwritten by the normalization/customization pipeline.

# Supabase Storage setup

The Phase 1 asset pipeline uses Supabase Storage for immutable source GLBs and generated artifacts.

## 1. Create a private bucket
Create a bucket named `product3d` (or set `SUPABASE_STORAGE_BUCKET` to another name). Keep it private.

Recommended bucket restrictions can be configured in the Supabase dashboard. The API also enforces `.glb` input and a configurable `MAX_ASSET_BYTES` guardrail before issuing a signed upload grant.

## 2. Configure keys
Use the current Supabase key model:
- Browser: `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...`
- API/worker: `SUPABASE_SECRET_KEY=sb_secret_...`

Never expose the secret key through a `NEXT_PUBLIC_` variable or commit it to Git.

## 3. Upload flow
1. Browser asks `POST /api/assets/import`.
2. API creates a unique immutable object path and calls Supabase `createSignedUploadUrl`.
3. Browser uses Supabase `uploadToSignedUrl` with the returned token.
4. Browser requests `POST /api/assets/:id/analyze`.
5. BullMQ worker downloads the source with the server-only secret key, validates/normalizes it, and uploads a new normalized object path.

Signed upload grants are time-limited. Source paths are unique per asset and are not overwritten.

## 4. Local development
`docker compose up -d` starts PostgreSQL and Redis only. Storage remains the configured hosted Supabase project so development and deployed workers share the same object-storage contract.

# API surface

Base URL: `/api`

## Asset pipeline

### `POST /assets/import`
Creates a `ModelAsset` in `AWAITING_UPLOAD` and returns a Supabase Storage signed-upload grant (`bucket`, `path`, `token`). The bucket is private; the browser uploads with `uploadToSignedUrl` using only the publishable key.

Request:
```json
{
  "name": "Dining Table",
  "originalFilename": "table.glb",
  "contentType": "model/gltf-binary",
  "sizeBytes": 10485760
}
```

Phase 1 accepts `.glb` as canonical editor input. `MAX_ASSET_BYTES` is configurable and defaults to 250 MB.

### `POST /assets/:id/analyze`
Checks that the source object exists in Supabase Storage, creates a persistent database `Job`, and queues `validate-normalize` in BullMQ.

Worker flow:
`Supabase download -> Khronos validation -> glTF Transform prune/dedup -> re-validation -> Supabase normalized GLB upload -> PostgreSQL state/result update`.

### `GET /jobs/:id`
Persistent states: `QUEUED`, `PROCESSING`, `RETRYING`, `COMPLETED`, `FAILED`.

### `GET /assets/:id/download?kind=source|normalized`
Returns a short-lived signed URL for the private Supabase bucket.

Other implemented routes:
- `GET /health`
- `GET /assets/:id`
- `GET /assets/:id/manifest`
- `PUT /assets/:id/manifest`
- `POST /projects`
- `GET /projects/:id`
- `PUT /projects/:id`
- `POST /projects/:id/versions`
- `GET /projects/:id/versions`
- `GET /materials`
- `GET /materials/:id`

Still intentionally unimplemented until their real provider/worker exists:
- `POST /projects/:id/export`
- `POST /projects/:id/manufacturability/check`

# API surface

Base URL: `/api`

## Asset pipeline

### `POST /assets/import`
Creates a `ModelAsset` in `AWAITING_UPLOAD` state and returns a presigned S3-compatible `PUT` URL.

Request:
```json
{
  "name": "Dining Table",
  "originalFilename": "table.glb",
  "contentType": "model/gltf-binary",
  "sizeBytes": 10485760
}
```

The response contains `asset` and `upload`. Upload the GLB bytes directly to `upload.url` with the returned headers. Phase 1 production upload accepts `.glb` only and caps declared size at 250 MB.

### `POST /assets/:id/analyze`
Verifies the source object exists, creates a database `Job`, queues `validate-normalize` in BullMQ, and moves the asset to `QUEUED`.

The background worker performs:
`S3 download -> Khronos validation -> glTF Transform prune/dedup -> re-validation -> normalized GLB upload -> PostgreSQL status/result update`.

### `GET /jobs/:id`
Returns the persistent job state. Current states used by the asset pipeline are `QUEUED`, `PROCESSING`, `RETRYING`, `COMPLETED`, and `FAILED`.

### `GET /assets/:id/download?kind=source|normalized`
Returns a short-lived presigned download URL. `kind` defaults to `normalized`.

Other implemented persistence-backed routes:
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

Worker/provider routes that still return `501 Not Implemented`:
- `POST /projects/:id/export`
- `POST /projects/:id/manufacturability/check`

# API surface

Base URL: `/api`

Authenticated business routes use the Supabase bearer token. Project/model/version/render/manufacturing/RFQ resources are resolved server-side against the authenticated user; the API does not trust a browser-supplied user ID as authorization.

## Health and auth

- `GET /health` — service health.
- Auth bootstrap/session-related routes are provided by the Supabase-backed auth controller; the web app authenticates with Supabase and sends the bearer token to protected API routes.

## Asset pipeline

### `POST /assets/import`

Creates an owned `ModelAsset` in `AWAITING_UPLOAD` and returns a signed Supabase Storage upload grant. Phase 1 accepts GLB as the canonical editor input. File metadata is validated server-side and `MAX_ASSET_BYTES` is configurable.

### `POST /assets/:id/analyze`
### `POST /assets/:id/normalize`

Queues the asset-processing worker:

`private Supabase source → Khronos validation → scene/mesh/primitive analysis → disconnected-island candidates → model-quality warnings → glTF Transform normalization → re-validation → private normalized GLB + PostgreSQL result`

Geometry connectivity is reported as candidate regions only; the system does not claim semantic segmentation from connectivity.

### Asset reads

- `GET /assets/:id`
- `GET /assets/:id/analysis`
- `GET /assets/:id/download?kind=source|normalized`
- `GET /assets/:id/manifest`
- `PUT /assets/:id/manifest`

Downloads are short-lived signed URLs for the private Supabase bucket.

## Jobs and artifacts

- `GET /jobs/:id` — persistent `QUEUED | PROCESSING | RETRYING | COMPLETED | FAILED` state.
- `GET /jobs/:id/artifact` — short-lived signed URL for a completed private artifact when the job result contains an object key.

Long-running GLB analysis/export, Blender render, geometry analysis and AI visualization run through BullMQ workers.

## Projects and versions

- `GET /projects`
- `POST /projects`
- `GET /projects/:id`
- `PUT /projects/:id`
- `POST /projects/:id/versions`
- `GET /projects/:id/versions`
- `POST /projects/:id/duplicate`

A `ModelVersion` stores a serializable configuration snapshot; it does not duplicate the immutable source GLB.

## Export

### `POST /projects/:id/export`

Body may contain a saved `versionId` or a valid current `configurationJson` and optional:

```json
{"format":"GLB"}
```

Supported formats:

- `GLB` — canonical full-fidelity customized export. Component dimensions/transforms/material/color/delete/visibility and catalog variant replacement are baked into the output. The final GLB is Khronos-validated before storage.
- `OBJ` — derived from the already-baked customized GLB and emitted in millimeter coordinates. Texture sidecars are not currently emitted.
- `STL` — geometry-only derived artifact in millimeter coordinates.

The original source GLB is never overwritten.

## Materials, variants, styles and presets

- `GET /materials`
- `GET /variants` with catalog filters such as group/role.
- `GET /styles`
- authenticated user-preset list/create/delete routes under `/presets`.

Variant binaries remain private; catalog responses hydrate short-lived signed URLs where needed by the editor.

## Render / 360

### `POST /render-jobs`

Requires a completed GLB export belonging to the same user/project. Supported modes:

- `MULTI_VIEW` — six catalogue/design-analysis views.
- `SPIN_360` — 12–120 frames.

Qualities: `DRAFT | STANDARD | HIGH`.

Additional routes:

- `GET /render-jobs/:id`
- `GET /render-jobs/:id/assets` — signed PNG URLs after completion.

Rendering is performed by the Blender worker against the exported current configuration.

## AI

Base: `/projects/:projectId/ai`

### `POST .../design-suggestions`

Requires the current validated configuration plus a completed project `MULTI_VIEW` render. The server supplies model metadata, valid component/material/variant/style IDs and constraint context to the configured provider. Provider output must match the structured schema; proposed actions are validated against catalog IDs, manifest rules, constraints and compatibility before the user can apply them.

Server-side hourly quota is enforced. API keys never go to the browser.

### `POST .../visualizations`

Requires a completed current-project render. Queues a server-side image-edit job that uses the product render as the reference, stores the generated PNG in private Supabase Storage and exposes it through the generic job artifact endpoint.

## Manufacturability

Base: `/projects/:projectId/manufacturability`

- `POST .../check` — deterministic rules against manifest + current configuration/material metadata; persists issues.
- `POST .../geometry` — requires a completed current-project GLB export and queues Trimesh geometry analysis.
- `GET .../checks/:checkId` — persisted deterministic + geometry result.

Geometry analysis runs against the customized export, not the immutable source model.

## Collection recommendation

### `POST /projects/:projectId/collection/recommendations`

Deterministic V1 ranking. Source profile is derived from the current configuration/manifest plus optional metadata. Ranking weights from the specification are:

- style: 50%
- material: 25%
- color: 15%
- other category/component metadata: 10%

The endpoint returns the score and breakdown for each recommendation.

## Workshop / RFQ / Quote

- `GET /workshops`
- `POST /projects/:projectId/rfq`
- `GET /projects/:projectId/rfq`
- `GET /rfq/:id`
- `POST /rfq/:id/quotes`
- `PATCH /rfq/:id/status`

RFQ creation verifies that the saved model version, GLB export, optional manufacturing check and optional render all belong to the authenticated project/user. The stored canonical RFQ payload keeps Supabase object keys/resource IDs rather than expiring URLs; reads hydrate fresh signed preview/export URLs.

RFQ lifecycle implemented in Phase 1:

`SUBMITTED → RECEIVED → ACCEPTED | REJECTED`

If an `expiresAt` is supplied, overdue `SUBMITTED` or `RECEIVED` requests transition to `EXPIRED` before RFQ reads/quote/status mutations.

## Storage/security notes

- Supabase Storage bucket is private.
- Browser receives only the publishable key plus short-lived signed grants/URLs.
- `SUPABASE_SECRET_KEY` and `OPENAI_API_KEY` are server/worker-only.
- Source GLB is immutable; normalization/render/export/AI output create separate artifacts.
- Structured AI output and editor actions are validated; dependency/manufacturing formula handling does not use arbitrary `eval`.

# Production deployment

This platform has independent web/API/background-worker processes. Do not deploy the repository as a single long-running Node process.

## Required managed services

- PostgreSQL 16-compatible database (`DATABASE_URL`). Supabase Postgres or another managed PostgreSQL provider is suitable.
- Redis compatible with BullMQ (`REDIS_URL`). Use a persistence/HA configuration appropriate for background jobs and keep the eviction policy at `noeviction`.
- Supabase project for Auth and private Storage.
- Private Storage bucket named by `SUPABASE_STORAGE_BUCKET` (default `product3d`).

The application does **not** use MinIO/S3 credentials. Server-side Storage operations use `SUPABASE_SECRET_KEY`; the browser receives only the Supabase publishable key and short-lived signed upload/download grants.

## Runtime processes

Deploy these independently so they can scale/fail without taking the editor down:

1. `apps/web` — Next.js web application.
2. `apps/api` — NestJS HTTP API.
3. `workers/asset-processing` — GLB validation, analysis and normalization.
4. `workers/export` — customized GLB baking, variant composition, OBJ/STL derived exports.
5. `workers/render` — Blender catalogue/multi-view/360 rendering.
6. `workers/geometry` — Trimesh geometry manufacturability analysis.
7. `workers/ai-visualization` — server-side lifestyle image generation.

The root workspace can build all TypeScript processes with `pnpm build`; production process supervisors should start only the process assigned to that service/container.

## Native/runtime dependencies

### Asset and GLB workers
Node.js 22 is the CI baseline. Draco/Meshopt support is installed from npm dependencies.

### Export worker
Install Python 3 and:

```bash
python -m pip install -r workers/export/requirements.txt
```

Python is used only for derived OBJ/STL conversion. GLB baking/validation remains Node + glTF Transform.

### Geometry worker
Install Python 3 and:

```bash
python -m pip install -r workers/geometry/requirements.txt
```

### Render worker
Install Blender and expose the binary through `BLENDER_BIN` (default `blender`). `workers/render/render.py` is executed in Blender headless mode.

## Environment

Start from `.env.example`. Important production-only rules:

- Never expose `SUPABASE_SECRET_KEY` or `OPENAI_API_KEY` through `NEXT_PUBLIC_*` variables.
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` is the browser key.
- Set `AI_PROVIDER=openai` only on server/API deployments where AI Suggest is enabled.
- Set worker concurrency based on CPU/RAM/GPU capacity. Blender and geometry workers should normally start conservatively.
- Configure asset guardrails (`MAX_ASSET_BYTES`, triangle/texture/root-scale warning thresholds) for customer workloads rather than hard-coding UI limits.

## First deployment

```bash
pnpm install --frozen-lockfile
pnpm --filter @product3d/api prisma:generate
pnpm --filter @product3d/api exec prisma migrate deploy
pnpm --filter @product3d/api storage:setup
pnpm --filter @product3d/api prisma:seed
pnpm build
```

`storage:setup` is idempotent. It creates or verifies a **private** Supabase Storage bucket and applies `MAX_ASSET_BYTES` as its file-size limit. Supabase supports private bucket creation and bucket-level file-size restrictions through the Storage API.

For existing installations, treat `prisma:seed` as catalogue/demo data maintenance rather than an automatic deploy step if production catalogues are customer-managed.

## Supabase Auth

Configure the allowed Site URL / redirect URLs in the Supabase project for the deployed web origin. The API validates Supabase bearer tokens; do not replace them with a browser-supplied user ID.

## Storage model

Canonical/private paths are server-generated:

- immutable source: `assets/<assetId>/source/...`
- normalized GLB: `assets/<assetId>/normalized/model.glb`
- exports: `exports/<projectId>/<jobId>/...`
- renders: `renders/<projectId>/<renderJobId>/...`
- AI visualization: `ai-visualizations/<userId>/<projectId>/...`
- catalog variants: `catalog/variants/...`

Persist object keys in PostgreSQL. Generate signed URLs at request time; do not persist expiring signed URLs as business state.

## Database and job rollout order

1. Apply Prisma migrations.
2. Deploy API code that understands the new schema.
3. Deploy workers with matching queue payload contracts.
4. Deploy web last.

For backwards-incompatible queue payload changes, drain or version queues before worker replacement. The current Phase 1 queue names are stable per capability.

## Health and smoke checks

After deploy:

1. `GET /api/health` returns `ok: true`.
2. Sign in through Supabase Auth.
3. Import a fixture GLB and confirm signed upload succeeds.
4. Confirm asset analysis reaches `COMPLETED` and normalized artifact exists.
5. Save a manifest/project/version.
6. Export GLB and re-open the signed artifact.
7. Run one render and one geometry check on worker-enabled environments.
8. If AI is enabled, run one structured AI Suggest request and verify the returned actions are validated before apply.

## Observability baseline

Workers/API emit job state and failure logs. Asset analysis, render, AI requests and deterministic manufacturability checks additionally emit structured JSON events with duration/outcome fields. Forward stdout/stderr to the deployment logging platform and derive counters/timers from the `event` field.

Useful metrics from the product spec include:

- `asset_import_duration`
- `asset_analysis_duration`
- `render_duration`
- `export_duration`
- `ai_request_count` / failures
- average model triangle count
- viewer load time

The repository currently provides structured log inputs for several of these; it does not bundle a vendor-specific metrics backend.

## Security checklist

- Supabase Storage bucket remains private.
- Server secret keys never enter client bundles.
- Upload extension/MIME/content are validated by API + GLB validator pipeline.
- Project/version/export/render/manufacturing/RFQ routes enforce authenticated ownership.
- AI structured output is schema-validated and proposed editor actions still pass Action/Constraint/Compatibility validation.
- Dependency/manufacturing formulas do not use arbitrary `eval`.
- Do not make uploaded glTF extensions executable code.

## Rollback

Application services can roll back independently when queue/database contracts are compatible. Database rollback should use explicit corrective migrations; do not automatically reverse destructive production migrations. Immutable source assets in Supabase are intentionally not overwritten by normalization/export jobs.

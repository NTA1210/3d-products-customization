# 3D Product Customization Platform

Production-oriented Phase 1 implementation of a **customer-asset-first 3D product configurator**. The canonical 3D comes from customer GLB assets; AI does not generate or replace the core 3D model. Manual controls, styles/presets and AI suggestions all resolve to structured editor actions that must pass schema, constraint and compatibility validation before changing business state.

## Implemented capabilities

- Supabase Auth and private Supabase Storage with short-lived signed upload/download grants.
- GLB import, Khronos validation, glTF Transform normalization, stable glTF source-index IDs and disconnected geometry-island candidate analysis.
- Asset Preparation with semantic role/editability/axis/range/material/variant/dependency configuration and persisted manifests.
- Place → Lock → Customize workflow.
- Component select/highlight, dimension/position/rotation, material/color, delete/restore/reset and unit conversion (`mm`, `cm`, `inch`).
- Shared Action / Constraint / Compatibility / Dependency pipeline with Undo/Redo and serializable state.
- Component variants with anchor/auto-fit metadata; style and user preset transactions.
- Supabase-backed projects, exact configuration versions, reload and duplicate.
- Variant-aware customized GLB export with Khronos re-validation; derived OBJ/STL exports in millimeter coordinates.
- Blender multi-view and spin-360 render jobs; current-configuration AR preview.
- Structured AI Design Suggest actions with server-side quota/provider calls and validation before apply.
- Server-side lifestyle visualization using the current product render as reference, stored in private Supabase Storage.
- Deterministic manufacturability rules plus Trimesh geometry analysis against the current exported GLB.
- Deterministic collection recommendation V1 and Workshop / RFQ / Quote persistence flow.
- GPU resource cleanup/error boundary, four required GLB fixture categories, domain/integration tests and CI builds.

## Repository layout

- `apps/web` — Next.js + React Three Fiber editor.
- `apps/api` — NestJS + Prisma API.
- `packages/*` — domain schema and deterministic editor/rule engines.
- `workers/asset-processing` — GLB validation, analysis and normalization.
- `workers/export` — customized GLB baking, variant composition and OBJ/STL conversion.
- `workers/render` — Blender catalogue/multi-view/360 rendering.
- `workers/geometry` — Trimesh geometry manufacturability analysis.
- `workers/ai-visualization` — queued lifestyle image generation.
- `examples/fixtures` — required model-quality/test scenarios.
- `docs` — architecture, API, deployment and Phase 1 status/audit.

## Local prerequisites

- Node.js 22 and pnpm 9.x.
- Docker for local PostgreSQL + Redis, or equivalent managed services.
- A Supabase project for Auth + private Storage.
- Python 3 for geometry analysis and OBJ/STL derived export.
- Blender for render/360 jobs.
- OpenAI API access only if AI Suggest / lifestyle visualization is enabled.

Supabase replaces the earlier MinIO/S3 development direction. The browser uses only the Supabase publishable key; `SUPABASE_SECRET_KEY` stays server-side.

## Local setup

1. Copy `.env.example` to `.env` and fill the Supabase values.
2. Start local database/queue dependencies:

   ```bash
   docker compose up -d
   ```

3. Install Node dependencies:

   ```bash
   pnpm install
   ```

4. Prepare Prisma and database:

   ```bash
   pnpm --filter @product3d/api prisma:generate
   pnpm --filter @product3d/api prisma:migrate
   pnpm --filter @product3d/api storage:setup
   pnpm --filter @product3d/api prisma:seed
   ```

5. For geometry and OBJ/STL workers:

   ```bash
   python -m pip install -r workers/geometry/requirements.txt
   python -m pip install -r workers/export/requirements.txt
   ```

6. Make Blender available as `blender` or set `BLENDER_BIN` if render jobs are needed.
7. Start the TypeScript workspace for development:

   ```bash
   pnpm dev
   ```

Web: `http://localhost:3000`  
API: `http://localhost:4000/api`

Background workers are independent processes and should be started/deployed for the capabilities you intend to exercise. See [`docs/PRODUCTION_DEPLOYMENT.md`](docs/PRODUCTION_DEPLOYMENT.md) for the production process and native dependency layout.

## Validation boundary

Repository CI currently validates Prisma generation, Python worker syntax, executable domain/integration tests, all four GLB fixtures with Khronos glTF Validator, and production TypeScript/Next builds.

CI does **not** currently stand up live Supabase/Redis/PostgreSQL/Blender/OpenAI services for a browser-level full-system E2E run. The export worker validates every generated GLB before storing it, but a live automated `export → signed download → import again` round-trip remains a distinct end-to-end evidence gap. These gaps are tracked explicitly rather than being reported as completed.

See:

- `docs/IMPLEMENTATION_STATUS.md` — feature/evidence matrix.
- `docs/PHASE1_GAP_AUDIT.md` — Definition-of-Done audit against the specification.
- `docs/API.md` — implemented HTTP surface.
- `docs/PRODUCTION_DEPLOYMENT.md` — deployment and runtime runbook.

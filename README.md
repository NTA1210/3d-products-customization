# 3D Product Customization Platform

Phase 1 foundation for a **customer-asset-first GLB product configurator**. The core editor does not generate 3D geometry with AI. Manual controls, presets/styles and future AI suggestions are represented as structured actions that must pass validation before changing the runtime scene.

## Implemented now
- Next.js + React Three Fiber web editor and NestJS API monorepo.
- Real local GLB upload in the browser.
- Generic scene traversal that detects mesh candidates without claiming semantic segmentation.
- Asset Preparation step: review candidates, assign semantic role, explicitly enable editability/axes.
- Place → Lock → Customize business flow.
- Component selection in tree or 3D viewer with temporary emissive highlight.
- Dimension, material and color actions through the shared Action/Constraint/Compatibility pipeline.
- Serializable configuration, undo/redo snapshots and configuration JSON export.
- Dependency rule schema and deterministic V1 dependency formulas (no `eval`).
- Prisma persistence model, initial SQL migration and material seed.
- API routes for projects/versions/manifests/materials; unconfigured worker-backed routes fail explicitly instead of returning fake success.
- Docker Compose for PostgreSQL, Redis and MinIO extension points.
- GitHub Actions build workflow.

## Local setup
1. Copy `.env.example` to `.env`.
2. `docker compose up -d`
3. `pnpm install`
4. `pnpm --filter @product3d/api prisma:generate`
5. `pnpm --filter @product3d/api prisma:migrate`
6. `pnpm --filter @product3d/api prisma:seed`
7. `pnpm dev`

Web: `http://localhost:3000`
API: `http://localhost:4000/api`

## Current P0 boundary
The browser can import and customize GLB meshes after explicit Asset Preparation. Production asset normalization, disconnected geometry-island extraction, signed S3 upload, background jobs and baked GLB export remain the next P0 slices. P1 AI/render/AR work must not bypass the Action Engine or displace P0 delivery.

See `docs/IMPLEMENTATION_STATUS.md` for the exact boundary.

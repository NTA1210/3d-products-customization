# Implementation status

## P0 working foundation
- Monorepo and local PostgreSQL/Redis infrastructure.
- GLB upload/viewer using React Three Fiber.
- Mesh candidate discovery for arbitrary GLB scene graphs.
- Asset Preparation gate with explicit role/editability/axis configuration.
- Component manifest + serializable configuration schema.
- Place -> Lock -> Customize guard.
- Structured action schema with schema validation.
- Dimension constraint/scaling-mode validation.
- Material/variant compatibility primitives.
- Deterministic dependency formulas (`DELTA_FACTOR`, `SET_VALUE`, `CLAMPED_DELTA_FACTOR`) without arbitrary evaluation.
- Realtime dimension/material/color projection into the Three.js scene.
- Tree/viewer selection + non-permanent highlight.
- Undo/redo snapshot history.
- Configuration JSON save/export.
- Prisma persistence schema + migrations + material seed.
- Project/version/manifest/material API persistence routes.
- Private Supabase Storage with signed browser uploads/downloads.
- BullMQ asset-processing queue and separate worker.
- Khronos glTF validation before/after normalization.
- Lossless glTF Transform normalization (`prune`, `dedup`) with Draco/Meshopt support.
- Persistent asset/job lifecycle and validation report storage.

## P0 next slices
- Disconnected geometry-island detection and merge/split Asset Preparation UI.
- Stable source-node/primitive mapping from glTF parser indices for production manifests.
- Persist server-produced asset analysis + model-quality warnings.
- GLB configuration baking + validation + re-import test.
- Fixture assets and automated unit/integration/E2E coverage.
- Hardened upload validation using observed object/content metadata rather than only declared request metadata.

## P1 next slices
- Variant asset replacement + anchors/auto-fit.
- Style/preset batch transaction UI.
- Browser/catalogue render and Blender render job.
- Structured AI design suggestions + visualization.
- Manufacturability rule engine + Trimesh worker.
- 360 viewer and AR current-configuration export.

## P2 next slices
- Collection recommendation.
- RFQ/workshop flow and polish.
- Additional export formats.
- Advanced geometry analysis.

Routes that still require unimplemented workers/providers return explicit `501 Not Implemented`; they never report fake successful jobs.

# Implementation status

## P0 working foundation
- Monorepo and local PostgreSQL/Redis/MinIO infrastructure.
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
- Signed S3/MinIO source upload and source/normalized download URLs.
- BullMQ asset processing producer + separate worker process.
- Khronos glTF 2.0 validation before and after normalization.
- glTF Transform normalization (`prune`, `dedup`) with standard extensions and Draco dependencies.
- Persistent asset/job lifecycle and validation report storage.
- Local MinIO bucket bootstrap/CORS and Redis `noeviction` configuration.

## P0 next slices
- Disconnected geometry-island detection and merge/split Asset Preparation UI.
- Stable source-node mapping from glTF parser indices for production manifests.
- GLB configuration baking + validation + re-import test.
- Fixture assets and automated unit/integration/E2E coverage.
- Hardened upload constraints using observed object metadata/checksum, not only declared request metadata.

## P1/P2 intentionally not faked
- Variant asset replacement/anchor auto-fit.
- Style/preset transaction UI.
- Blender photorealistic render.
- AI design suggestions and lifestyle visualization.
- Manufacturability Trimesh worker.
- AR current-configuration export.
- Collection recommendation and RFQ/workshop flow.

Routes that still require unimplemented workers/providers return explicit `501 Not Implemented`; they do not claim success with demo IDs.

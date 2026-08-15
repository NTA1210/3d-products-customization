# Implementation status

## P0 working foundation
- Monorepo and local infrastructure.
- GLB upload/viewer using React Three Fiber.
- Mesh candidate discovery for arbitrary GLB scene graphs.
- Asset Preparation gate with explicit role/editability/axis configuration.
- Component manifest + serializable configuration schema.
- Place → Lock → Customize guard.
- Structured action schema with schema validation.
- Dimension constraint/scaling-mode validation.
- Material/variant compatibility primitives.
- Deterministic dependency formulas (`DELTA_FACTOR`, `SET_VALUE`, `CLAMPED_DELTA_FACTOR`) without arbitrary evaluation.
- Realtime dimension/material/color projection into the Three.js scene.
- Tree/viewer selection + non-permanent highlight.
- Undo/redo snapshot history.
- Configuration JSON save/export.
- Prisma persistence schema + migration + material seed.
- Project/version/manifest/material API persistence routes.

## P0 next slices
- Khronos/glTF-Transform validation and normalization pipeline.
- Disconnected geometry-island detection and merge/split Asset Preparation UI.
- Stable source-node mapping from glTF parser indices for production manifests.
- Signed S3/MinIO upload/download adapters.
- BullMQ asset/export workers.
- GLB configuration baking + validation + re-import test.
- Fixture assets and automated unit/integration/E2E coverage.

## P1/P2 intentionally not faked
- Variant asset replacement/anchor auto-fit.
- Style/preset transaction UI.
- Blender photorealistic render.
- AI design suggestions and lifestyle visualization.
- Manufacturability Trimesh worker.
- AR current-configuration export.
- Collection recommendation and RFQ/workshop flow.

Routes that require workers/providers return explicit `501 Not Implemented` until their real adapter exists; they do not claim success with demo IDs.

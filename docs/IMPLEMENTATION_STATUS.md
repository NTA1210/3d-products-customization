# Implementation status

## P0 working foundation
- Monorepo and local infrastructure.
- GLB upload/viewer using React Three Fiber.
- Supabase private object storage with signed upload/download grants.
- BullMQ validation/normalization worker.
- Khronos glTF validation plus lossless glTF Transform normalization.
- Source scene/mesh/primitive analysis with stable parser-index IDs.
- Disconnected triangle-island detection as non-semantic candidate regions.
- Model-quality warnings for one mesh, continuous mesh, missing material/UV, duplicates, empty nodes, high triangle count and unsupported primitive topology.
- Asset Preparation gate with explicit role/editability/axis configuration.
- Component manifest + serializable configuration schema.
- Place → Lock → Customize guard.
- Structured action schema and constraint/material/variant/dependency validation foundation.
- Realtime dimension/material/color projection into Three.js.
- Tree/viewer selection + undo/redo snapshot history.
- Prisma persistence, project/version/manifest/material APIs.

## P0 next slices
- Asset Preparation merge/split logical regions, constraints/anchors/compatibility/dependency editing, manifest import/export/save/reload polish.
- Full unit conversion controls and component translate/rotate/delete UI.
- Stable persisted project reload in the web editor.
- GLB configuration baking + validation + re-import test.
- Fixture assets and automated unit/integration/E2E coverage.

## P1 next slices
- Variant replacement/anchor auto-fit.
- Style/preset transaction UI and user presets.
- Browser/server render, multi-view capture and 360 viewer.
- AI structured suggestions/visualization with quota and logs.
- Manufacturability rules + geometry worker.
- AR from current configuration.

## P2 next slices
- Collection recommendation.
- Workshop/RFQ flow and integration polish.
- Additional formats and advanced geometry analysis.

No feature is marked complete merely because a placeholder endpoint exists.

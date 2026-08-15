# Implementation status

## P0 working foundation
- GLB viewer/import with Supabase private object storage and BullMQ processing.
- Khronos validation, normalization, source-index analysis and disconnected geometry-island candidates.
- Stable component source mapping from glTF parser indices, not mesh names.
- Asset Preparation: rename, role, visibility, editability/axes, scaling mode, min/max constraints, anchors, variant group, material categories, region mapping and dependency JSON.
- Manifest strict schema validation, persistence, reload, JSON import/export.
- Place → Lock → Customize.
- Structured Action Engine, constraints, material/variant compatibility, deterministic dependencies, undo/redo.
- Realtime dimension/material/color projection.
- Prisma project/version/manifest/material persistence foundation.
- Executable domain tests run in CI for action schema, constraints, compatibility, units, dependencies, transaction rollback and version serialization.

## P0 next slices
- Component translate/rotate/delete/restore controls and richer unit selector UI.
- Persisted project creation/reload from the web editor.
- GLB configuration baking/export + validation + re-import fixture test.
- Fixture GLBs and integration/E2E critical flow.

## P1 next slices
- Variant asset replacement + anchors/auto-fit.
- Style/preset transaction UI + user presets.
- Browser/server render, multi-view capture, 360 viewer.
- AI structured suggestions/visualization with quota/logs.
- Manufacturability rules + geometry worker.
- AR from current configuration.

## P2 next slices
- Collection recommendation.
- Workshop/RFQ.
- Additional formats and advanced geometry analysis.

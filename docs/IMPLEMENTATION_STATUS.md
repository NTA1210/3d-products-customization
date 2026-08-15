# Implementation status

This file describes the **current code/evidence boundary**, not the original bootstrap plan. Features are not marked complete merely because a route or button exists; runtime/provider-dependent capabilities are identified explicitly.

## P0 — implemented in code

### Asset import and preparation
- Supabase Auth ownership for imported assets.
- Private Supabase Storage with signed browser upload/download grants; immutable source object keys.
- GLB canonical input, MIME/metadata guardrails and configurable upload-size limit.
- Khronos glTF validation before normalization and after normalization.
- glTF Transform normalization with Draco/Meshopt support.
- Stable source node/mesh/primitive IDs based on glTF indices rather than mesh names.
- Disconnected triangle-island candidates for one-mesh assets, without claiming semantic segmentation.
- Model-quality warnings for missing material/UV, empty node, duplicate names, one mesh, disconnected islands, continuous one-mesh fallback, high triangle count, high texture resolution/encoded size and suspicious/non-uniform root scale.
- Asset Preparation UI for name/role/editability/axes/scaling mode/dimension constraints/material categories/variant group/anchors/region mapping/dependencies/visibility.
- Persisted Component Manifest.

### Editor core
- Place → Lock → Customize gate.
- Direct component selection/highlight.
- Width/height/depth with editable-axis and min/max validation.
- Component position/rotation, material/color, delete/restore/reset.
- `mm`, `cm`, `inch` conversion into canonical internal millimeters.
- Structured Action schema and shared Constraint / Compatibility / Dependency pipeline.
- Undo/Redo and batch transactions.
- Runtime Three.js scene remains a projection of serializable configuration.
- Deterministic dependency formulas; no arbitrary `eval`.

### Persistence and output
- Authenticated Project CRUD/list/load/duplicate.
- ModelVersion configuration snapshots and exact reload path.
- Variant-aware customized GLB export built from immutable source + configuration.
- Khronos validation of generated GLB before storage.
- Derived OBJ/STL exports from the already-baked customized GLB; derived coordinates are millimeters.
- Export artifacts use separate Supabase object keys rather than overwriting source assets.

## P1 — implemented in code

### Materials / variants / styles / presets
- Material library and compatibility checks.
- Component variant catalog, private signed variant assets, replacement and AUTO_FIT metadata.
- Variant composition in realtime viewer and final GLB export.
- Style rule transactions and user presets through the same editor action pipeline.

### Render / 360 / AR
- BullMQ render jobs with Blender headless worker.
- Multi-view catalogue/design-analysis render.
- Spin-360 frame render.
- Current-configuration AR flow based on an exported GLB.

### AI
- Structured Design Suggest request built from current configuration, manifest constraints and valid catalog IDs.
- Server-side provider call with hourly quota.
- Strict structured response validation plus Action/Constraint/Compatibility validation before user apply.
- Server-side lifestyle visualization queue using a current product render as image reference; generated PNG stored privately in Supabase.
- AI credentials remain server-side.

### Manufacturability
- Deterministic manufacturing rule engine against current configuration/material metadata.
- Persisted issue reports and suggested editor actions where rules provide them.
- Trimesh worker for geometry facts/issues against the **current customized GLB export**.

## P2 / Week 6 — implemented in code

### Collection
- Deterministic collection recommendation engine.
- Spec weighting: 50% style, 25% material, 15% color, 10% other/category/component metadata.
- Persisted collection catalog and score breakdown API/UI.

### Workshop / RFQ
- Workshop, QuoteRequest and Quote persistence.
- RFQ canonical payload includes project/version, dimensions, component state, materials, manufacturing issues, preview object keys and export object key.
- API reads hydrate fresh signed preview/export URLs; expiring signed URLs are not stored as business state.
- Ownership checks for saved version/export/render/manufacturing resources.
- Lifecycle `SUBMITTED → RECEIVED → ACCEPTED | REJECTED`, plus lazy `EXPIRED` transition for overdue requests.

## QA / hardening implemented

- Four required GLB fixture categories:
  1. proper components,
  2. one mesh with disconnected islands,
  3. single continuous mesh,
  4. multi-material model.
- Fixtures are validated with Khronos glTF Validator in executable tests.
- Domain tests cover action/constraint/compatibility/dependency/unit/manufacturing/version/preset/collection logic.
- Critical-flow integration test covers Lock guard, dimension/material/color, Undo/Redo and exact configuration serialization/reload.
- Viewer owns and disposes cloned GPU resources; GLTF/variant caches are cleared on teardown.
- App-level user-facing error boundary avoids raw production stack trace UI.
- CI runs Prisma generation, Python worker syntax validation, tests and production TypeScript/Next builds.
- Asset analysis/render/AI/manufacturability emit structured duration/outcome logs; other workers retain persistent Job lifecycle/failure records.
- Production deployment runbook and idempotent private Supabase bucket setup command.

## Evidence gaps before declaring the full specification demonstrably Done

These are intentionally **not** marked complete yet:

1. **Browser-level full-system E2E:** CI does not currently run Playwright/Cypress against live Postgres + Redis + Supabase Auth/Storage + all workers. The current critical-flow test is domain/integration level.
2. **Live export round-trip automation:** every generated GLB is validator-checked in the export worker, but CI does not currently run a live `export → signed download → import/analyze again` worker round trip.
3. **External runtime smoke coverage:** Blender, Trimesh jobs, Supabase signed storage and OpenAI provider calls require deployed/native/external services and are not executed in standard repository CI.
4. **RFQ preview automation:** RFQ accepts a verified completed render and then carries preview images, but the current web convenience flow does not force a Blender preview render before every RFQ; preview arrays may be empty.
5. **Separate manufacturing-issue AI explanation:** structured design suggestions and deterministic/geometry manufacturing reports exist, but there is no dedicated provider-backed endpoint whose sole purpose is to explain a manufacturing issue.
6. **Vendor metrics backend:** structured logs and metric-friendly duration fields exist, but Prometheus/Datadog/OpenTelemetry export is deployment-specific and not bundled.
7. **Dependency/browser compatibility audit:** package peer dependency alignment and real-device/browser AR/performance still require environment-level verification.

See `PHASE1_GAP_AUDIT.md` for the 22-step Definition-of-Done mapping.

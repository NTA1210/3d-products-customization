# Architecture

## Source of truth
- Original GLB: immutable customer asset in S3-compatible object storage.
- Normalized GLB: validated/normalized derivative; never overwrites the original.
- Manifest: stable component/rule definition produced by Asset Preparation.
- Configuration: current serializable customization state.
- Version: persisted configuration snapshot.
- Runtime Three.js scene: projection only.
- Export GLB: generated artifact from original/normalized asset + configuration.

## Mutation pipeline
`Manual / Preset / Style / AI -> Structured Action -> Schema Validation -> Constraint Validation -> Compatibility Validation -> Dependency Resolution -> Apply -> Runtime Projection -> History / Version`

The current web editor exercises the Manual path. Future preset/style/AI adapters must emit the same `EditorAction` shapes and call `editor-core`; direct scene mutation is not a business-state API.

## Asset workflow
`Request signed upload -> direct GLB PUT -> enqueue analysis -> Khronos glTF validation -> glTF Transform normalization -> normalized GLB -> Asset Preparation review -> Manifest -> Placement -> Lock -> Component customization`

The API is the BullMQ producer and fails quickly when Redis is unavailable. `workers/asset-processing` is a separate consumer process with worker-oriented reconnect behavior. Redis is configured with `noeviction` locally.

Object storage uses S3 APIs through AWS SDK v3 and supports MinIO locally. Object keys are persisted separately from temporary signed URLs; URLs are generated only when a client needs upload/download access.

Mesh connectivity or scene-node boundaries are still treated as candidates, not semantic truth. Disconnected geometry-island extraction and stable parser-index mapping remain the next P0 asset-processing slice.

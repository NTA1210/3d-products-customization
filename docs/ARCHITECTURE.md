# Architecture

## Source of truth
- Original GLB: immutable customer asset.
- Manifest: stable component/rule definition produced by Asset Preparation.
- Configuration: current serializable customization state.
- Version: persisted configuration snapshot.
- Runtime Three.js scene: projection only.
- Export GLB: generated artifact from original asset + configuration.

## Mutation pipeline
`Manual / Preset / Style / AI -> Structured Action -> Schema Validation -> Constraint Validation -> Compatibility Validation -> Dependency Resolution -> Apply -> Runtime Projection -> History / Version`

The current web editor exercises the Manual path. Future preset/style/AI adapters must emit the same `EditorAction` shapes and call `editor-core`; direct scene mutation is not a business-state API.

## Asset workflow
`Upload GLB -> Scene traversal -> Candidate meshes -> Asset Preparation review -> Manifest -> Placement -> Lock -> Component customization`

Mesh connectivity or scene-node boundaries are treated as candidates, not semantic truth. Production geometry-island extraction belongs in the background asset-processing pipeline.

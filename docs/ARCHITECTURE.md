# Architecture

## Source of truth

- **Original GLB** — immutable customer asset in private Supabase Storage.
- **Normalized GLB** — validated/normalized derivative; never overwrites the source.
- **Manifest** — stable component/rule definition produced by Asset Preparation.
- **Configuration** — current serializable customization state.
- **ModelVersion** — persisted configuration snapshot, not a duplicate source model.
- **Runtime Three.js scene** — projection of asset + manifest + configuration only.
- **Export artifacts** — generated outputs from immutable source + current/saved configuration.
- **Render/AI artifacts** — separate private derivatives referenced by object keys.

Expiring signed URLs are transport credentials, not business state. PostgreSQL stores object keys/resource IDs; APIs mint short-lived signed URLs when a client needs an artifact.

## Mutation pipeline

```text
Manual / Preset / Style / AI
  → Structured EditorAction
  → Schema Validation
  → Constraint Validation
  → Compatibility Validation
  → Dependency Resolution
  → Apply Command / Transaction
  → Serializable Configuration
  → Runtime Projection
  → History / ModelVersion
```

Manual controls, style/preset rules and validated AI suggestions all use the same action shapes and editor core. AI does not mutate the Three.js scene directly and does not generate the canonical 3D model.

## Asset workflow

```text
Supabase Auth
  → POST /assets/import
  → signed private Supabase upload grant
  → browser uploads source GLB
  → BullMQ asset-processing job
  → Khronos validation
  → source-index scene analysis
  → disconnected geometry-island candidates
  → model-quality warnings
  → glTF Transform normalization
  → Khronos re-validation
  → normalized private GLB + persisted analysis
  → Asset Preparation
  → saved Manifest
  → Place
  → Lock
  → Customize
```

Stable component candidates use glTF node/mesh/primitive source indices, never mesh names as the sole business ID. Connectivity regions are **geometry candidates only** and remain semantically unconfirmed until Asset Preparation.

## Storage and identity

Supabase is used for:

- Auth identity/session tokens.
- private source/normalized/export/render/AI/variant Storage artifacts.
- signed upload/download grants.

The browser receives only the publishable key plus temporary signed grants. `SUPABASE_SECRET_KEY` stays in API/workers.

Storage object keys follow capability namespaces such as:

- `assets/<assetId>/source/...`
- `assets/<assetId>/normalized/model.glb`
- `catalog/variants/...`
- `exports/<projectId>/<jobId>/...`
- `renders/<projectId>/<renderJobId>/...`
- `ai-visualizations/<userId>/<projectId>/...`

## Background jobs

```text
API
  ↓
Redis / BullMQ
  ↓
Capability worker
  ↓
Supabase Storage + PostgreSQL Job/result state
```

Long-running capabilities are separated into workers:

- `asset-processing` — validation/analysis/normalization.
- `export` — customized GLB baking, variant composition, OBJ/STL derived conversion.
- `render` — Blender multi-view and spin-360.
- `geometry` — Trimesh manufacturability facts/issues.
- `ai-visualization` — queued server-side product-reference image generation.

The API is the queue producer and persists `QUEUED/PROCESSING/RETRYING/COMPLETED/FAILED` state. Workers update the same database Job record and store artifact keys/results separately.

## Export pipeline

Canonical export:

```text
immutable source GLB
  + saved/current Configuration
  + persisted Manifest
  + MaterialPreset catalogue
  + ComponentVariant catalogue/private variant GLB
  → glTF Transform document
  → bake transforms/dimensions/material/color/visibility/delete
  → composite replaced variants
  → apply whole-product placement
  → write GLB
  → Khronos validation
  → private Supabase export artifact
```

OBJ/STL are derived **after** the customized GLB is baked/validated, so they do not introduce another business-state path. Because GLB/glTF linear units are meters while OBJ/STL lack a reliable unit field, derived manufacturing coordinates are exported in platform-canonical millimeters.

## Render / AI / manufacturing

- Render jobs require a completed GLB export owned by the same project/user.
- AI Design Suggest requires current configuration + a completed project multi-view render and receives only valid catalog IDs/rules. Structured provider output is validated again before it becomes applicable editor actions.
- Lifestyle visualization uses a current render as product reference and creates a separate PNG artifact; it does not alter canonical model state.
- Deterministic manufacturing rules evaluate manifest/configuration/material metadata.
- Geometry manufacturing analysis runs against the **customized exported GLB**, not source geometry.

## Collection and RFQ

Collection recommendation is a deterministic domain engine using the specification weighting:

`50% style + 25% material + 15% color + 10% other metadata`.

RFQ state references a real saved ModelVersion and verified current-project export, with optional verified render/manufacturing resources. The canonical payload stores object keys/IDs; fresh signed preview/export URLs are generated for reads.

## Frontend state and GPU lifecycle

Zustand stores serializable editor state only. Three.js objects are not persisted as business state.

Runtime viewer resources are cloned/owned by the projection layer and explicitly dispose geometry/material/texture resources when models/variants are replaced or unloaded. Drei GLTF cache and the variant cache are cleared during teardown to reduce GPU-memory accumulation.

## Security boundaries

- Authenticated ownership is checked for project/version/export/render/manufacturing/RFQ resources.
- Source asset remains immutable.
- AI/provider secrets and Supabase service secret remain server-side.
- Uploaded GLB content is validated; glTF extension content is data, not executable application code.
- No arbitrary `eval` is used for dependency/manufacturing formulas.
- AI output is schema/catalog/rule validated before editor application.

## Validation boundary

Repository CI validates TypeScript builds, Prisma generation, Python worker syntax, domain/integration tests and required GLB fixtures. Live external/native-system E2E evidence (Supabase, Redis workers, Blender, OpenAI, device AR and full export→re-import round trip) is tracked separately in `PHASE1_GAP_AUDIT.md` rather than being implied by compilation alone.

# Phase 1 Definition-of-Done audit

Source: `3D_Product_Customization_Agent_Spec.md`, section **Definition of Done — Phase 1** and its required fixture scenarios.

Status legend:

- ✅ implemented and backed by repository code/tests/build evidence.
- 🟡 implemented in code but dependent on external/native runtime or missing live-system evidence.
- ❌ not implemented.

This audit deliberately distinguishes **implementation**, **deterministic CI regression evidence**, and **live deployed-system evidence**.

| # | Required demo step | Status | Repository evidence / boundary |
|---|---|---|---|
| 1 | Import model GLB | ✅ | Signed Supabase upload, owned ModelAsset and web import flow; Chromium CI exercises the browser import path with external boundaries mocked. |
| 2 | System analyze model | ✅ | Asset worker validates GLB, analyzes source indices/islands/model-quality warnings, normalizes and persists analysis. |
| 3 | User review/configure Component Manifest | ✅ | Asset Preparation UI + persisted manifest routes; exercised in Chromium CI. |
| 4 | Open editor | ✅ | Manifest save transitions to editor state; exercised in Chromium CI. |
| 5 | Position model | ✅ | Whole-model placement move/rotate before Lock. |
| 6 | Lock placement | ✅ | Lock gate disables component customization before Lock and enables it after; exercised in Chromium CI. |
| 7 | Select a component | ✅ | Tree/direct 3D selection with highlight. |
| 8 | Resize within constraints | ✅ | Axis-aware dimension action + min/max/scaling-mode validation; exercised in Chromium CI. |
| 9 | Change material/color | ✅ | Compatibility-aware material and color actions projected realtime; material path exercised in Chromium CI. |
| 10 | Replace compatible component | ✅ | Variant catalog/replacement/AUTO_FIT plus final export composition. |
| 11 | Apply style/preset | ✅ | Style and user-preset transactions emit normal editor actions. |
| 12 | Undo/Redo | ✅ | Snapshot history and executable integration/domain tests; exercised in Chromium CI. |
| 13 | Save version | ✅ | Persisted ModelVersion configuration snapshot; browser Save Version path is exercised in Chromium CI with API boundary mocked. |
| 14 | Reload project and retain exact state | ✅ | Project/version hydrate path + exact serialization/reload integration assertion. |
| 15 | Run AI Suggest and receive structured actions | 🟡 | Implemented server-side with render input, schema-constrained provider response and quota; requires configured OpenAI + render runtime for live proof. |
| 16 | Apply valid AI suggestion through validator | ✅ | AI validation produces only validated actions; web applies via normal `dispatchBatch` / editor pipeline. |
| 17 | Run Manufacturability Check | ✅ | Deterministic manufacturing rules are tested in Vitest and the actual Trimesh geometry analyzer is installed/executed in standard CI against all four GLB fixtures. Live BullMQ/storage orchestration remains a staging certification boundary, not an implementation gap. |
| 18 | Render preview | 🟡 | Blender multi-view/SPIN_360 queue/worker implemented; Blender binary is not run by standard CI. |
| 19 | Export customized GLB | ✅ | Current/saved configuration baking, variant composition and Khronos validation before storage; browser Export command path is exercised in Chromium CI with API boundary mocked. |
| 20 | Re-import exported GLB successfully | 🟡 | Exported GLB is Khronos-validator checked before completion. A manual `Staging E2E` workflow now performs live export→download→GLB-header verification→re-import→analyze when a staging deployment and test credentials are configured; it remains 🟡 until that workflow succeeds against the live environment. |
| 21 | Launch AR preview with current configuration | 🟡 | Current-configuration export + AR path exists; device/browser AR is not exercised by standard CI. |
| 22 | Generate RFQ payload | ✅ | Persisted Workshop/RFQ flow with saved version, dimensions/components/materials/issues/previews/export references and fresh signed artifact URLs. |

## Required model scenarios

| Scenario | Status | Evidence |
|---|---|---|
| Proper multi-component model | ✅ | `examples/fixtures/proper-components.glb` + Khronos fixture test + Chromium critical-flow fixture + Trimesh worker smoke. |
| One mesh with multiple disconnected geometry islands | ✅ | `examples/fixtures/disconnected-islands.glb` + analyzer island behavior/tests + Trimesh assertion for multiple bodies. |
| One continuous mesh fallback/warning | ✅ | `examples/fixtures/continuous-mesh.glb` + warning/fallback behavior + Trimesh assertion for one body. |
| Multi-material fixture required by test strategy | ✅ | `examples/fixtures/multi-material.glb`, Khronos validated and Trimesh-analyzed in CI. |

## Acceptance-criteria coverage summary

### Asset import

- Valid GLB display/import: implemented.
- Multi-mesh candidate listing: implemented.
- One-mesh disconnected geometry candidate detection: implemented.
- No semantic-split pretence: implemented; regions are explicitly unconfirmed geometry candidates.
- Manifest save/reload: implemented.

### Place/Lock

- Whole-model move/rotate before Lock: implemented.
- Component customization controls blocked before Lock: implemented in editor rule/validation flow.
- Component editing after Lock: implemented.
- Placement remains serializable configuration state rather than a scene-only mutation.

### Component customization

- Direct viewer select/highlight: implemented.
- Editable axes/min/max validation: implemented.
- Realtime projection after valid actions: implemented.
- Unit conversion to internal mm: implemented/tested.
- Dependencies resolve after source changes: implemented/tested.

### Material/color/variant

- Material compatibility enforcement: implemented.
- Realtime material/color: implemented.
- Version persistence + Undo restoration: implemented.
- Variant compatibility/catalog flow, anchor/AUTO_FIT metadata and Undo/Redo: implemented.
- Variant is composited into final exported GLB rather than rejected by export.

## Test/evidence status

### Deterministic browser E2E — ✅

The main CI runs a Playwright/Chromium critical-flow regression using the real Next.js UI, real GLB fixture, Three.js/R3F viewer, editor state, Action/Constraint pipeline and Undo/Redo. Only external Supabase/API network boundaries are mocked so the test is deterministic.

Covered browser path:

`Sign in → Import GLB → Asset Preparation → Save Manifest → Place/Lock → Dimension → Material → Undo → Redo → Create Project → Save Version → Export GLB`.

This is browser/UI regression evidence. It is intentionally **not** described as proof that a deployed Supabase/PostgreSQL/Redis/worker stack is healthy.

### Native geometry worker CI — ✅

Standard CI installs `workers/geometry/requirements.txt` and executes `workers/geometry/analyze.py` against all four Phase 1 GLB fixtures. The smoke test verifies non-empty geometry facts, disconnected-body detection, the `geometry:multiple-bodies` issue, and the continuous-mesh single-body case.

This demonstrates the Trimesh runtime itself on a clean GitHub runner. It does not replace a live queue/storage smoke test for the deployed geometry worker service.

### Live staging E2E path — available, runtime evidence pending

`.github/workflows/staging-e2e.yml` is a manually triggered live-system workflow. With a configured `staging` environment and these secrets:

- `STAGING_WEB_URL`
- `STAGING_E2E_EMAIL`
- `STAGING_E2E_PASSWORD`

it exercises the deployed application and real external infrastructure rather than route mocks.

The staging test uploads `proper-components.glb`, waits for the real asset pipeline, edits/saves/exports the project, downloads the customized GLB, verifies the binary `glTF` header, re-imports the exact downloaded bytes as a new asset, and waits for the analyzer to reach `Asset: ready` again.

The workflow's presence is not counted as a successful live proof until an actual staging run succeeds.

### Observability — implemented, ingestion proof pending

The API exposes Prometheus-compatible `/api/metrics`, derives worker/job metrics from persisted PostgreSQL state, accepts authenticated `viewer_load_time` telemetry, and supports an optional scrape bearer token. Standard tests validate the exposition output. A production metrics backend still needs to scrape it and verify dashboards/alerts in the chosen deployment environment.

### External providers/native tools

Standard CI validates TypeScript builds/tests, Python syntax, executable Trimesh geometry analysis, and the deterministic Chromium flow. It does not execute Blender, live Supabase signed storage/queue orchestration, or OpenAI requests. These require the staging/deployment smoke path and provider/runtime configuration.

## Recommended remaining closure order

1. Configure a staging deployment + GitHub `staging` environment secrets and run `Staging E2E` successfully.
2. Add live smoke coverage for the deployed geometry queue and Blender preview/render workers; Trimesh itself is already exercised in standard CI.
3. Run AR preview on at least one supported real mobile/device browser and capture evidence.
4. Add a controlled live AI Suggest smoke test with quota/cost guardrails.
5. Connect `/api/metrics` to the deployment's metrics backend and verify scrape ingestion, dashboarding and alerting.
6. Keep the Chromium critical-flow and Trimesh fixture smoke tests required in CI to prevent regressions.

Until the live-system items above are exercised, the repository should be described as **Phase 1 feature-complete in code with browser critical-flow and native Trimesh runtime evidence, plus remaining live deployment/provider certification gaps**, not as fully production-certified.

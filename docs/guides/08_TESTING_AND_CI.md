# 08 - Testing & CI

Guide này mô tả test nào dùng cho layer nào và CI hiện kiểm tra những gì.

## 1. Root commands

```bash
pnpm test
pnpm test:e2e
pnpm build
pnpm check
```

- `pnpm test` → Vitest.
- `pnpm test:e2e` → Playwright.
- `pnpm build` → Turbo build toàn workspace.
- `pnpm check` → TypeScript no-emit check cho web + API.

## 2. Test layout

Các test chính dưới `tests/`:

- `domain.test.ts` — action schema, constraints, units, compatibility, dependencies, serialization, manufacturing, AI validation.
- `critical-flow.integration.test.ts` — central editor/domain flow.
- `preset-engine.test.ts` — preset/style engine.
- `collection-engine.test.ts` — recommendation engine.
- `model-quality.test.ts` — model quality/analyzer behavior.
- `fixtures.test.ts` — required GLB fixtures/Khronos validation.
- `metrics.test.ts` — Prometheus metric exposition.
- `geometry_worker_smoke.py` — executable Trimesh runtime smoke.
- `tests/e2e/` — deterministic Chromium editor flow.
- `tests/staging/` — live deployed-system flow.

## 3. Required GLB fixtures

```text
examples/fixtures/proper-components.glb
examples/fixtures/disconnected-islands.glb
examples/fixtures/continuous-mesh.glb
examples/fixtures/multi-material.glb
```

Các fixture dùng để tránh chỉ test một model “đẹp”.

## 4. Domain test nên dùng khi nào

Dùng Vitest khi thay đổi:

- action schema.
- constraint/min/max/lock.
- material/variant compatibility.
- dependency formula.
- preset/style transaction.
- serialization/version state.
- manufacturing rule.
- AI structured action validation.
- collection scoring.

Domain test phải nhanh và không cần Supabase/Redis thật.

## 5. Browser E2E

Playwright critical flow dùng:

- real Next.js UI.
- real React Three Fiber/Three.js viewer.
- real GLB fixture.
- real Zustand/editor/action/constraint flow.

External Supabase/API boundary được route-mock để deterministic.

Critical path hiện bao gồm:

```text
Sign in
→ Import GLB
→ Asset Preparation
→ Save Manifest
→ Lock
→ Dimension
→ Material
→ Undo/Redo
→ Create Project
→ Save Version
→ Export GLB
```

Nếu sửa flow này, cập nhật test thay vì xóa assertion để làm CI xanh.

## 6. Native Trimesh smoke

CI cài:

```bash
python -m pip install -r workers/geometry/requirements.txt
```

rồi chạy `tests/geometry_worker_smoke.py` trên 4 GLB fixtures.

Smoke test xác nhận runtime thật của `trimesh.load`, mesh facts, disconnected body detection và continuous mesh behavior.

## 7. Staging E2E

Workflow manual:

```text
.github/workflows/staging-e2e.yml
```

Cần GitHub environment `staging` với:

```text
STAGING_WEB_URL
STAGING_E2E_EMAIL
STAGING_E2E_PASSWORD
```

Flow live:

```text
real sign-in
→ real Supabase upload
→ real asset worker
→ edit/save/export
→ download exported GLB
→ verify GLB
→ re-import exported bytes
→ real analyze ready
```

Sự tồn tại của workflow không đồng nghĩa live proof đã pass; xem `PHASE1_GAP_AUDIT.md`.

## 8. Main CI

Workflow:

```text
.github/workflows/ci.yml
```

Các quality gate chính:

1. install pnpm dependencies.
2. Prisma generate.
3. Python worker syntax.
4. install geometry Python runtime.
5. execute Trimesh smoke.
6. Vitest.
7. production build.
8. install Chromium.
9. browser critical-flow E2E.

Playwright report/trace được upload khi browser test fail.

## 9. Test strategy khi thêm feature

### Thêm EditorAction

Cần tối thiểu:

- schema test.
- validation test.
- apply/transaction test.
- Undo/Redo behavior nếu ảnh hưởng state.

### Thêm worker

Cần:

- TypeScript build.
- Python syntax nếu có Python.
- executable native smoke nếu dependency cho phép chạy trong CI.
- failure/result contract test.

### Thêm UI critical operation

Nếu operation nằm trên đường chính của user, thêm Playwright coverage.

### Thêm provider/external integration

Giữ deterministic test ở CI + live smoke riêng có quota/credentials.

## 10. Khi CI fail

Không tắt quality gate. Xác định layer fail:

```text
install → dependency/lockfile
Prisma → schema/generate
Vitest → domain regression
build → TS/Next/Nest compilation
Trimesh → Python/native runtime
Playwright → browser/UI regression
```

Đọc artifact `build-log` hoặc `playwright-report` nếu workflow tạo ra.

## 11. Tài liệu liên quan

- [../PHASE1_GAP_AUDIT.md](../PHASE1_GAP_AUDIT.md)
- [../IMPLEMENTATION_STATUS.md](../IMPLEMENTATION_STATUS.md)
- [03 - Web Editor](03_WEB_EDITOR.md)
- [06 - Workers & Pipelines](06_WORKERS_AND_PIPELINES.md)

# 08 - Kiểm thử và CI

Tài liệu này mô tả loại test nào dùng cho layer nào và CI hiện kiểm tra những gì.

## 1. Các lệnh ở root

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

## 2. Cấu trúc test

Các test chính dưới `tests/`:

- `domain.test.ts` — action schema, constraint, unit, compatibility, dependency, serialization, manufacturing, AI validation.
- `critical-flow.integration.test.ts` — luồng editor/domain chính.
- `preset-engine.test.ts` — preset/style engine.
- `collection-engine.test.ts` — recommendation engine.
- `model-quality.test.ts` — hành vi model quality/analyzer.
- `fixtures.test.ts` — GLB fixture bắt buộc/Khronos validation.
- `metrics.test.ts` — định dạng xuất metric Prometheus.
- `geometry_worker_smoke.py` — smoke test thực thi Trimesh runtime.
- `tests/e2e/` — luồng editor Chromium có tính xác định.
- `tests/staging/` — luồng hệ thống đã deploy thật.

## 3. GLB fixture bắt buộc

```text
examples/fixtures/proper-components.glb
examples/fixtures/disconnected-islands.glb
examples/fixtures/continuous-mesh.glb
examples/fixtures/multi-material.glb
```

Các fixture dùng để tránh chỉ test một model “đẹp”.

## 4. Khi nào nên dùng domain test

Dùng Vitest khi thay đổi:

- action schema.
- constraint/min/max/lock.
- compatibility material/variant.
- công thức dependency.
- transaction preset/style.
- serialization/version state.
- manufacturing rule.
- validation structured action của AI.
- collection scoring.

Domain test phải nhanh và không cần Supabase/Redis thật.

## 5. Browser E2E

Playwright critical flow sử dụng:

- UI Next.js thật.
- React Three Fiber/Three.js viewer thật.
- GLB fixture thật.
- luồng Zustand/editor/action/constraint thật.

Boundary Supabase/API bên ngoài được route-mock để test có tính xác định.

Đường chính hiện bao gồm:

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

Nếu sửa luồng này, hãy cập nhật test thay vì xóa assertion chỉ để CI xanh.

## 6. Smoke test Trimesh native

CI cài:

```bash
python -m pip install -r workers/geometry/requirements.txt
```

sau đó chạy `tests/geometry_worker_smoke.py` trên 4 GLB fixture.

Smoke test xác nhận runtime thật của `trimesh.load`, mesh fact, phát hiện body rời rạc và hành vi continuous mesh.

## 7. Staging E2E

Workflow chạy thủ công:

```text
.github/workflows/staging-e2e.yml
```

Cần GitHub environment `staging` với:

```text
STAGING_WEB_URL
STAGING_E2E_EMAIL
STAGING_E2E_PASSWORD
```

Luồng live:

```text
đăng nhập thật
→ upload Supabase thật
→ asset worker thật
→ chỉnh sửa/lưu/export
→ tải GLB đã export
→ kiểm tra GLB
→ re-import bytes đã export
→ analyzer thật đạt ready
```

Việc workflow tồn tại không đồng nghĩa live proof đã pass; xem `PHASE1_GAP_AUDIT.md`.

## 8. CI chính

Workflow:

```text
.github/workflows/ci.yml
```

Các quality gate chính:

1. cài dependency pnpm.
2. Prisma generate.
3. kiểm tra syntax Python worker.
4. cài geometry Python runtime.
5. chạy Trimesh smoke.
6. Vitest.
7. production build.
8. cài Chromium.
9. browser critical-flow E2E.

Playwright report/trace được upload khi browser test thất bại.

## 9. Chiến lược test khi thêm feature

### Thêm EditorAction

Cần tối thiểu:

- schema test.
- validation test.
- apply/transaction test.
- kiểm tra hành vi Undo/Redo nếu ảnh hưởng state.

### Thêm worker

Cần:

- TypeScript build.
- kiểm tra syntax Python nếu có Python.
- executable native smoke nếu dependency có thể chạy trong CI.
- test contract failure/result.

### Thêm thao tác UI quan trọng

Nếu thao tác nằm trên đường chính của người dùng, thêm Playwright coverage.

### Thêm tích hợp provider/external

Giữ deterministic test trong CI + live smoke riêng có quota/credential.

## 10. Khi CI thất bại

Không tắt quality gate. Xác định layer lỗi:

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
- [06 - Worker và pipeline](06_WORKERS_AND_PIPELINES.md)

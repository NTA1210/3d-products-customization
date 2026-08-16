# 02 - Repository và kiến trúc

Tài liệu này trả lời hai câu hỏi: **code nằm ở đâu?** và **một thay đổi đi qua hệ thống như thế nào?**

## 1. Cấu trúc monorepo

```text
apps/
  web/                  Next.js + React + React Three Fiber
  api/                  NestJS + Prisma

packages/
  action-engine/        schema EditorAction
  compatibility-engine/compatibility material/variant
  constraint-engine/    lock, axis, min/max, unit
  editor-core/          áp dụng action/batch + dependency resolution
  model-schema/         Zod domain schema
  preset-engine/        logic transaction preset/style
  manufacturing-engine/quy tắc manufacturing xác định
  ai-engine/            kiểm tra structured AI response
  collection-engine/    logic recommendation xác định
  shared/               constant/type dùng chung

workers/
  asset-processing/     validate/analyze/normalize GLB
  export/               bake customized GLB + OBJ/STL
  render/               Blender multi-view / spin-360
  geometry/             phân tích manufacturability bằng Trimesh
  ai-visualization/     lifestyle visualization qua hàng đợi

examples/
  fixtures/             model GLB dùng cho test
  manifests/            manifest mẫu
  materials/            dữ liệu catalog mẫu

docs/                   tài liệu architecture/API/deployment/guides
```

## 2. Nguồn dữ liệu chuẩn

Đừng coi object Three.js đang hiển thị trên màn hình là dữ liệu chính.

Thứ tự nguồn dữ liệu chuẩn:

1. **Original GLB** — asset khách hàng, bất biến.
2. **Normalized GLB** — bản dẫn xuất đã validate/normalize.
3. **Manifest** — định nghĩa component/rule đã được người dùng xác nhận.
4. **Configuration** — trạng thái customization hiện tại.
5. **ModelVersion** — snapshot của Configuration.
6. **Three.js scene** — projection ở runtime.
7. **Export/render/AI artifact** — output dẫn xuất.

Khi debug sai state, ưu tiên kiểm tra Manifest/Configuration trước scene.

## 3. Pipeline thay đổi trạng thái

Mọi thay đổi component phải theo pipeline:

```text
Manual / Preset / Style / AI
        ↓
EditorAction
        ↓
Schema validation
        ↓
Constraint validation
        ↓
Compatibility validation
        ↓
Dependency resolution
        ↓
Apply command / batch
        ↓
Configuration mới
        ↓
Three.js projection + history/version
```

Các package cần đọc theo thứ tự khi debug action:

1. `packages/action-engine`
2. `packages/constraint-engine`
3. `packages/compatibility-engine`
4. `packages/editor-core`
5. `apps/web/lib/store.ts`
6. `apps/web/components/ModelViewport.tsx`

## 4. Vòng đời asset

```text
Trình duyệt
  → POST /assets/import
  → signed Supabase upload
  → POST /assets/:id/analyze
  → BullMQ
  → asset-processing worker
  → Khronos validate
  → mesh/primitive/island analysis
  → glTF Transform normalize
  → validate lại
  → Supabase normalized GLB + analysis trong PostgreSQL
  → Asset Preparation UI
  → Manifest
  → Editor
```

Disconnected island chỉ là **geometry candidate**, không tự động được coi là semantic component cho tới khi người dùng xác nhận.

## 5. Vòng đời project

```text
Asset + Manifest
  → Create Project
  → current Configuration
  → Save Version
  → ModelVersion snapshot
  → Export job
  → Render / Manufacturability / AR / RFQ
```

`ModelVersion` không copy source GLB. Nó giữ configuration snapshot để tái tạo customization từ source + manifest + catalog.

## 6. Kiến trúc background job

```text
API producer
  → Redis/BullMQ
  → capability worker
  → Supabase artifact + PostgreSQL Job state
```

Trạng thái job chuẩn:

```text
QUEUED → PROCESSING → COMPLETED
                  ↘ RETRYING
                  ↘ FAILED
```

Không triển khai tác vụ nặng bằng cách `await` Blender/Trimesh trong HTTP controller.

## 7. Ranh giới Storage

Trình duyệt:

- Supabase publishable key.
- signed upload token / signed download URL.

Server/worker:

- `SUPABASE_SECRET_KEY`.
- object key chuẩn.

Một số namespace chính:

```text
assets/.../source/...
assets/.../normalized/model.glb
catalog/variants/...
exports/...
renders/...
ai-visualizations/...
```

## 8. Khi đọc source lần đầu

Đường đọc frontend được đề xuất:

```text
apps/web/app/page.tsx
→ apps/web/components/EditorShell.tsx
→ apps/web/lib/store.ts
→ apps/web/components/ModelViewport.tsx
→ packages/editor-core
```

Đường đọc backend được đề xuất:

```text
apps/api/src/main.ts
→ apps/api/src/module.ts
→ controller của capability
→ queue service
→ worker/src/index.ts
→ Prisma / StorageService
```

## 9. Tài liệu liên quan

- [../ARCHITECTURE.md](../ARCHITECTURE.md)
- [04 - API Backend](04_API_BACKEND.md)
- [06 - Worker và pipeline](06_WORKERS_AND_PIPELINES.md)
- [11 - Hướng dẫn mở rộng](11_EXTENSION_GUIDE.md)

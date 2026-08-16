# 02 - Repository & Architecture

Guide này trả lời hai câu hỏi: **code nằm ở đâu?** và **một thay đổi đi qua hệ thống như thế nào?**

## 1. Monorepo layout

```text
apps/
  web/                  Next.js + React + React Three Fiber
  api/                  NestJS + Prisma

packages/
  action-engine/        EditorAction schema
  compatibility-engine/material/variant compatibility
  constraint-engine/    lock, axis, min/max, units
  editor-core/          apply action/batch + dependency resolution
  model-schema/         Zod domain schemas
  preset-engine/        preset/style transaction logic
  manufacturing-engine/deterministic manufacturing rules
  ai-engine/            structured AI response validation
  collection-engine/    deterministic recommendation logic
  shared/               shared constants/types

workers/
  asset-processing/     validate/analyze/normalize GLB
  export/               bake customized GLB + OBJ/STL
  render/               Blender multi-view / spin-360
  geometry/             Trimesh manufacturability analysis
  ai-visualization/     queued lifestyle visualization

examples/
  fixtures/             GLB test models
  manifests/            sample manifest
  materials/            sample catalogue data

docs/                   architecture/API/deployment/guides
```

## 2. Source of truth

Đừng coi object Three.js đang hiển thị trên màn hình là dữ liệu chính.

Thứ tự source of truth:

1. **Original GLB** — asset khách hàng, immutable.
2. **Normalized GLB** — derivative đã validate/normalize.
3. **Manifest** — component/rule definition đã được người dùng xác nhận.
4. **Configuration** — customization state hiện tại.
5. **ModelVersion** — snapshot của Configuration.
6. **Three.js scene** — projection runtime.
7. **Export/render/AI artifacts** — derivative output.

Khi debug sai state, ưu tiên kiểm tra Manifest/Configuration trước scene.

## 3. Mutation pipeline

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

## 4. Asset lifecycle

```text
Browser
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

Disconnected islands chỉ là **geometry candidates**, không tự động được coi là semantic component cho tới khi user xác nhận.

## 5. Project lifecycle

```text
Asset + Manifest
  → Create Project
  → current Configuration
  → Save Version
  → ModelVersion snapshot
  → Export job
  → Render / Manufacturability / AR / RFQ
```

`ModelVersion` không copy source GLB. Nó giữ configuration snapshot để tái tạo customization từ source + manifest + catalogue.

## 6. Background job architecture

```text
API producer
  → Redis/BullMQ
  → capability worker
  → Supabase artifact + PostgreSQL Job state
```

Job status chuẩn:

```text
QUEUED → PROCESSING → COMPLETED
                  ↘ RETRYING
                  ↘ FAILED
```

Không implement tác vụ nặng bằng cách `await` Blender/Trimesh trong controller HTTP.

## 7. Storage boundary

Browser:

- Supabase publishable key.
- signed upload token / signed download URL.

Server/worker:

- `SUPABASE_SECRET_KEY`.
- object key canonical.

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

Frontend path đề xuất:

```text
apps/web/app/page.tsx
→ apps/web/components/EditorShell.tsx
→ apps/web/lib/store.ts
→ apps/web/components/ModelViewport.tsx
→ packages/editor-core
```

Backend path đề xuất:

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
- [06 - Workers & Pipelines](06_WORKERS_AND_PIPELINES.md)
- [11 - Extension Guide](11_EXTENSION_GUIDE.md)

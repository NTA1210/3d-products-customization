# 03 - Web Editor

Guide này dành cho developer sửa giao diện, editor state và Three.js projection.

## 1. Entry points cần đọc

```text
apps/web/app/page.tsx
apps/web/components/AuthPanel.tsx
apps/web/components/EditorShell.tsx
apps/web/components/ModelViewport.tsx
apps/web/lib/store.ts
```

Các component feature-level khác:

- `WorkspaceControls.tsx` — project/version/export/render/AR controls.
- `StyleVariantTools.tsx` — style/preset/variant UI.
- `AiManufacturingTools.tsx` — AI Suggest và manufacturability UI.
- `CollectionWorkshopTools.tsx` — collection recommendation và RFQ/workshop UI.
- `ModelViewerPreview.tsx` — `<model-viewer>`/AR preview layer.

## 2. Luồng UI chính

```text
Auth
→ Import GLB
→ Asset Preparation
→ Save Manifest
→ Editor
→ Place
→ Lock
→ Customize
→ Save Version / Export / Render / AI / Manufacturing / RFQ
```

`EditorShell.tsx` là orchestrator lớn nhất của editor UI. Khi cần tìm “button này gọi gì”, bắt đầu ở đây.

## 3. State model

Zustand store giữ **serializable editor state**, ví dụ:

- asset URL/name/analysis.
- Manifest.
- Configuration.
- selected component.
- editor phase.
- placement mode / lock state.
- history Undo/Redo.
- variant signed URLs / catalog-derived runtime resources.

Không đưa `THREE.Object3D`, `Mesh`, `Material`, `Texture` vào business state.

## 4. Three.js projection

`ModelViewport.tsx` chịu trách nhiệm:

1. Load GLB với `useGLTF`.
2. Clone scene/resource để editor sở hữu lifecycle.
3. Map runtime mesh sang stable component ID.
4. Build initial Manifest/Configuration candidate state.
5. Project Configuration vào scene:
   - dimensions.
   - position / rotation.
   - material / color.
   - visibility / delete.
   - variant replacement.
6. Highlight selected component.
7. Apply whole-product placement transform.
8. Dispose geometry/material/texture và clear cache khi unload.
9. Gửi `viewer_load_time` telemetry sau khi model mount.

### Quy tắc quan trọng

Nếu muốn thêm một loại customization mới, **không sửa scene trực tiếp từ click handler**.

Sai:

```ts
mesh.scale.x = 2;
```

Đúng về kiến trúc:

```text
UI event
→ EditorAction
→ store.dispatch / dispatchBatch
→ editor-core validation/apply
→ Configuration đổi
→ ModelViewport project state vào mesh
```

## 5. Asset Preparation

Asset Preparation là nơi chuyển geometry candidate thành domain definition.

Các field có thể gồm:

- semantic role.
- editable.
- editable axes.
- scaling mode.
- min/max constraints.
- material categories.
- variant group.
- dependency definition.

User xác nhận xong thì Manifest được persist qua API. Không tự coi mesh name là semantic truth.

## 6. Place → Lock → Customize

Trước Lock:

- cho phép whole-model placement.
- component customization phải bị chặn bởi constraint layer.

Sau Lock:

- component action mới được phép apply.

Nếu UI vô tình enable input trước Lock thì backend/domain validation vẫn phải từ chối action; UI disable chỉ là UX, không phải validation duy nhất.

## 7. Các loại editor action

Action schema nằm trong `packages/action-engine` và được `packages/editor-core` apply.

Các nhóm hiện có bao gồm:

- dimension.
- position.
- rotation.
- material.
- color.
- visibility.
- delete / restore / reset.
- variant replacement.
- style/preset batch.

AI Suggest cũng phải trả về các action cùng contract này.

## 8. API access từ web

Các helper dưới `apps/web/lib/` chịu trách nhiệm gọi API và Supabase.

Ví dụ:

- `supabase-browser.ts` — browser client + `authFetch`.
- `asset-api.ts` — import/upload/analyze/manifest.
- `metrics.ts` — viewer telemetry.

`authFetch` lấy session token từ Supabase và gửi `Authorization: Bearer ...` tới NestJS API.

## 9. Khi thêm một UI control mới

Checklist:

1. Xác định action type đã tồn tại chưa.
2. Nếu chưa, thêm schema/action ở package domain trước.
3. Thêm validation ở constraint/compatibility nếu cần.
4. Thêm apply logic trong editor-core.
5. Thêm control trong UI.
6. Dispatch action, không mutate scene.
7. Project state mới trong `ModelViewport` nếu action tạo visual effect mới.
8. Thêm Undo/Redo test.
9. Nếu nằm trong critical flow, cập nhật Playwright E2E.

## 10. Debug frontend theo triệu chứng

### UI đổi nhưng model không đổi

Kiểm tra:

1. action có dispatch không.
2. `applyAction/applyActions` có trả `ok` không.
3. Configuration trong store có đổi không.
4. effect trong `ModelViewport` có subscribe đúng dependency không.

### Model đổi nhưng save/reload mất state

Khả năng lớn là thay đổi chỉ tồn tại ở scene, chưa nằm trong Configuration hoặc schema serialization.

### Chọn sai component

Kiểm tra stable `__componentId`, glTF source association và manifest mapping; không fallback bằng mesh name nếu có source index.

## 11. Tài liệu liên quan

- [02 - Repository & Architecture](02_REPOSITORY_AND_ARCHITECTURE.md)
- [../ARCHITECTURE.md](../ARCHITECTURE.md)
- [../VARIANTS_PRESETS.md](../VARIANTS_PRESETS.md)
- [08 - Testing & CI](08_TESTING_AND_CI.md)

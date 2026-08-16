# 03 - Web Editor

Tài liệu này dành cho developer sửa giao diện, trạng thái editor và projection Three.js.

## 1. Các file bắt đầu nên đọc

```text
apps/web/app/page.tsx
apps/web/components/AuthPanel.tsx
apps/web/components/EditorShell.tsx
apps/web/components/ModelViewport.tsx
apps/web/lib/store.ts
```

Các component ở cấp tính năng khác:

- `WorkspaceControls.tsx` — điều khiển project/version/export/render/AR.
- `StyleVariantTools.tsx` — UI style/preset/variant.
- `AiManufacturingTools.tsx` — UI AI Suggest và manufacturability.
- `CollectionWorkshopTools.tsx` — UI collection recommendation và RFQ/workshop.
- `ModelViewerPreview.tsx` — lớp preview `<model-viewer>`/AR.

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

## 3. Mô hình state

Zustand store giữ **editor state có thể serialize**, ví dụ:

- URL/name/analysis của asset.
- Manifest.
- Configuration.
- component đang được chọn.
- phase của editor.
- placement mode / lock state.
- history Undo/Redo.
- signed URL của variant / runtime resource lấy từ catalog.

Không đưa `THREE.Object3D`, `Mesh`, `Material`, `Texture` vào business state.

## 4. Projection Three.js

`ModelViewport.tsx` chịu trách nhiệm:

1. Load GLB bằng `useGLTF`.
2. Clone scene/resource để editor sở hữu lifecycle.
3. Map runtime mesh sang stable component ID.
4. Tạo state candidate ban đầu cho Manifest/Configuration.
5. Project Configuration vào scene:
   - dimension.
   - position / rotation.
   - material / color.
   - visibility / delete.
   - thay variant.
6. Highlight component đang chọn.
7. Áp dụng transform vị trí cho toàn bộ sản phẩm.
8. Dispose geometry/material/texture và clear cache khi unload.
9. Gửi telemetry `viewer_load_time` sau khi model được mount.

### Quy tắc quan trọng

Nếu muốn thêm một loại customization mới, **không sửa scene trực tiếp từ click handler**.

Sai:

```ts
mesh.scale.x = 2;
```

Đúng theo kiến trúc:

```text
UI event
→ EditorAction
→ store.dispatch / dispatchBatch
→ editor-core validation/apply
→ Configuration thay đổi
→ ModelViewport project state vào mesh
```

## 5. Asset Preparation

Asset Preparation là nơi chuyển geometry candidate thành domain definition.

Các field có thể gồm:

- semantic role.
- editable.
- editable axis.
- scaling mode.
- constraint min/max.
- material category.
- variant group.
- định nghĩa dependency.

Sau khi người dùng xác nhận, Manifest được lưu qua API. Không tự coi mesh name là semantic truth.

## 6. Place → Lock → Customize

Trước Lock:

- cho phép đặt vị trí toàn bộ model.
- component customization phải bị chặn bởi constraint layer.

Sau Lock:

- component action mới được phép áp dụng.

Nếu UI vô tình bật input trước Lock thì backend/domain validation vẫn phải từ chối action; disable ở UI chỉ là UX, không phải lớp validation duy nhất.

## 7. Các loại editor action

Action schema nằm trong `packages/action-engine` và được `packages/editor-core` áp dụng.

Các nhóm hiện có bao gồm:

- dimension.
- position.
- rotation.
- material.
- color.
- visibility.
- delete / restore / reset.
- thay variant.
- batch style/preset.

AI Suggest cũng phải trả về action theo cùng contract này.

## 8. Truy cập API từ web

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
6. Dispatch action, không mutate scene trực tiếp.
7. Project state mới trong `ModelViewport` nếu action tạo hiệu ứng hiển thị mới.
8. Thêm test Undo/Redo.
9. Nếu nằm trong critical flow, cập nhật Playwright E2E.

## 10. Debug frontend theo triệu chứng

### UI đổi nhưng model không đổi

Kiểm tra:

1. action có được dispatch không.
2. `applyAction/applyActions` có trả `ok` không.
3. Configuration trong store có thay đổi không.
4. effect trong `ModelViewport` có subscribe đúng dependency không.

### Model đổi nhưng save/reload mất state

Khả năng lớn là thay đổi chỉ tồn tại trong scene, chưa nằm trong Configuration hoặc schema serialization.

### Chọn sai component

Kiểm tra stable `__componentId`, association theo source glTF và manifest mapping; không fallback bằng mesh name nếu đã có source index.

## 11. Tài liệu liên quan

- [02 - Repository và kiến trúc](02_REPOSITORY_AND_ARCHITECTURE.md)
- [../ARCHITECTURE.md](../ARCHITECTURE.md)
- [../VARIANTS_PRESETS.md](../VARIANTS_PRESETS.md)
- [08 - Kiểm thử và CI](08_TESTING_AND_CI.md)

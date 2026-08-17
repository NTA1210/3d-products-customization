# 13 - Editor UI và Keyboard Shortcuts

Tài liệu này mô tả editor chrome, component labels và shortcut system của web editor.

## Mục tiêu UX

Editor dùng cấu trúc quen thuộc của các 3D authoring/configurator tool:

1. **Left panel**: component hierarchy / model structure.
2. **Center viewport**: model, transform gizmo, viewport toolbar, Snap feedback.
3. **Right panel**: properties/inspector của part đang chọn.
4. **Global header**: asset/project/import/export — không dùng cho thao tác transform thường xuyên.
5. **Status footer**: phase, asset/project ID và canonical unit.

Các repo tham khảo khi thiết kế lại interaction:

- `gorhorvat/product-configurator-3d` — product configurator với part selection / move mode / hover highlight.
- `pascalorg/editor` — editor shell tách hierarchy, viewport và inspector.
- `pmndrs/triplex` — visual workspace cho React Three Fiber.
- `TangSY/aedifex` — editor/viewer/core packages và interaction kiểu desktop editor.
- `pmndrs/uikit` — responsive/themed UI trong hệ sinh thái React Three Fiber.

Đây là **tham khảo pattern**, không copy component/code của các repo trên.

## Component labels

Label có 3 mode:

- `Selected`: chỉ hiện tên component đang chọn. Đây là mặc định.
- `All`: hiện tên tất cả component visible.
- `Off`: ẩn label text, nhưng selection outline vẫn giữ lại.

Shortcut `L` chỉ toggle `Off` ↔ mode visible gần nhất. Vì vậy nếu user đang ở `All`, nhấn `L` tắt label rồi nhấn lại sẽ quay về `All`.

Nearest/Snap indicator không bị coi là component label thường. Khi đang kéo part, feedback `Nearest part`, gap mm và `READY TO SNAP` vẫn được phép hiển thị để thao tác không mất ngữ cảnh.

## Shortcut architecture

Không gắn `window.keydown` riêng trong `ModelViewport` hoặc từng panel.

Các layer:

- `apps/web/lib/keyboard-shortcuts.ts`
  - danh sách action và default binding;
  - normalize `Ctrl`/`Cmd` thành `Mod`;
  - chuyển keyboard event thành binding;
  - conflict detection.
- `apps/web/lib/shortcut-store.ts`
  - Zustand store;
  - lưu binding vào `localStorage`;
  - đổi/reset/clear shortcut.
- `apps/web/components/KeyboardShortcuts.tsx`
  - **global keyboard dispatcher duy nhất**;
  - thực thi action trên Editor Store / Snap Store;
  - dialog record shortcut.
- `apps/web/components/WorkspaceToolbar.tsx`
  - hiển thị shortcut gần tool đang dùng;
  - Undo/Redo, transform, Snap, Label mode và nút mở Shortcut Settings.

Không chạy shortcut khi focus nằm trong `input`, `textarea`, `select` hoặc `contenteditable`.

## Shortcut mặc định

| Action | Binding |
|---|---|
| Undo | `Ctrl/Cmd + Z` |
| Redo | `Ctrl/Cmd + Shift + Z` |
| Move | `W` |
| Rotate | `E` |
| Resize | `R` |
| Component labels | `L` |
| Magnetic Snap | `S` |
| Delete selected component | `Delete` |

User có thể mở **Shortcuts** trên viewport toolbar, click binding rồi nhấn tổ hợp phím mới. Nếu binding mới trùng một action khác, binding được chuyển sang action mới và action cũ được unassign để không có hai command chạy cùng lúc.

## Quy tắc khi thêm shortcut mới

1. Thêm action vào `ShortcutAction` và `SHORTCUT_DEFINITIONS`.
2. Thực thi action trong `executeShortcut()`.
3. Không thêm một `window.addEventListener('keydown')` thứ hai cho cùng feature.
4. Shortcut phải đi qua Store/EditorAction hiện có; không mutate Three.js scene trực tiếp.
5. Thêm unit test cho normalize/conflict nếu binding có hành vi mới.
6. Nếu shortcut ảnh hưởng critical workflow, bổ sung browser E2E.

## Quy tắc editor chrome

- Undo/Redo và transform là **viewport-local tools**.
- Project/import/export là **global tools**.
- Label và Snap phải thể hiện trạng thái ON/OFF/mode ngay trên toolbar.
- Inspector chỉ chứa thuộc tính của selection; không lặp lại tất cả global action.
- Khi viewport hẹp, text label của toolbar có thể ẩn nhưng icon/shortcut/status vẫn phải nhận biết được.

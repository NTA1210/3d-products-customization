# Variant, anchor, style và preset

Các bản ghi trong variant catalog trỏ tới object riêng tư trên Supabase Storage. `prisma:seed` sẽ upload ví dụ `wide-top-variant.glb` đi kèm khi các biến môi trường Supabase đã được cấu hình.

`GET /api/variants?groupId=&role=` trả về metadata catalog tương thích cùng một signed asset URL có thời hạn ngắn. Việc thay thế ở runtime sử dụng `AUTO_FIT` theo tâm bounds cho kích thước component hiện tại. Lựa chọn variant được lưu tại `configuration.components[id].variantId`, vì vậy Undo/Redo và snapshot Version đều bao gồm giá trị này.

Các rule của style và user preset sử dụng `@product3d/preset-engine`. Selector nhắm tới stable component ID hoặc semantic role. Compiler tạo ra các object `EditorAction` thông thường, sau đó `editor-core.applyActions` đi qua cùng luồng schema/constraint/compatibility/dependency như chỉnh sửa thủ công. Một style/preset được commit vào history như một transaction duy nhất trong web store.

Hỗ trợ anchor hiện tại bao gồm định nghĩa anchor trong manifest và policy auto-fit `BOUNDS_CENTER` của catalog. Việc author thêm POINT/PLANE/AXIS có thể được lưu trong `manifest.anchors` và được mở rộng bằng các quy tắc fitting nâng cao ở các phần sau.

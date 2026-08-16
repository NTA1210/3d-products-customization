# Pipeline export GLB

`POST /api/projects/:id/export` xác định cấu hình nguồn từ một snapshot cấu hình được truyền trực tiếp, một phiên bản đã lưu hoặc phiên bản đang hoạt động. Các schema dùng chung kiểm tra manifest/cấu hình trước khi tạo một export job trong BullMQ.

Export worker thực hiện:
1. tải GLB nguồn bất biến từ Supabase Storage riêng tư;
2. clone các mesh primitive nguồn theo từng node đã cấu hình để tránh thay đổi các mesh instance dùng chung;
3. áp dụng kích thước hiện tại, translation/rotation/scale của component, trạng thái visibility/delete, material preset và color override;
4. áp dụng vị trí của toàn bộ sản phẩm thông qua một wrapper node;
5. ghi ra một GLB mới;
6. kiểm tra kết quả bằng Khronos glTF Validator;
7. lưu artifact tại `exports/<project>/<job>/<filename>`;
8. cung cấp URL tải xuống có thời hạn ngắn thông qua `GET /api/jobs/:id/artifact`.

`variantId` đang hoạt động hiện sẽ trả lỗi `EXPORT_VARIANT_NOT_COMPOSITED` thay vì tạo ra một file sai về mặt hiển thị. Việc ghép asset variant được triển khai ở slice variant/anchor tiếp theo.

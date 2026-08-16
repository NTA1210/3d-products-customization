# Xác thực, quyền sở hữu và phiên bản dự án

Ứng dụng web sử dụng session của Supabase Auth. Các request đến API mang header `Authorization: Bearer <access-token>` và NestJS xác minh từng token thông qua Supabase Auth trước khi tin cậy danh tính người dùng.

Các tài nguyên được bảo vệ đều kiểm tra quyền sở hữu trong cơ sở dữ liệu ứng dụng:
- `ModelAsset.ownerId` của asset mới import phải khớp với người dùng Supabase đã xác thực;
- `Project.userId` luôn lấy từ request đã được xác minh, không bao giờ lấy trực tiếp từ JSON phía client;
- các endpoint phân tích asset, manifest và download truy vấn đồng thời theo asset ID và owner ID;
- các endpoint trạng thái job và artifact kiểm tra quyền thông qua chủ sở hữu của asset liên quan;
- preset của người dùng chỉ nằm trong phạm vi của người dùng đã được xác minh.

Các asset cũ được tạo trước migration này có thể có `ownerId = null`; hệ thống không tự động xem chúng là tài sản của bất kỳ người dùng đã xác thực nào.

Workspace trên web hỗ trợ:
1. đăng nhập/đăng ký;
2. import và chuẩn bị GLB;
3. tạo project và phiên bản ban đầu;
4. lưu thêm các phiên bản cấu hình;
5. tải project hoặc phiên bản đã chọn bằng URL GLB nguồn được ký mới;
6. export cấu hình hiện tại thành artifact GLB đã được kiểm tra hợp lệ.

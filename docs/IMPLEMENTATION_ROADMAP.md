# Lộ trình triển khai còn lại của Phase 1

Repository được triển khai theo các slice nhỏ và mỗi slice đều phải vượt qua CI. Storage sử dụng Supabase Storage riêng tư; PostgreSQL tiếp tục là nguồn dữ liệu ứng dụng cho metadata/cấu hình và Redis/BullMQ tiếp tục là hàng đợi cho các job chạy dài.

Các slice còn lại trong spec sau Render/360/AR:

1. P1: đề xuất thiết kế bằng AI, tích hợp provider đa góc nhìn, lifestyle visualization và quota/rate limiting.
2. P1: các quy tắc khả năng sản xuất có tính quyết định + geometry worker nặng + phần giải thích AI tùy chọn.
3. P2: đề xuất collection theo cách xác định.
4. P2: các entity Workshop/RFQ và luồng yêu cầu báo giá có xác thực.
5. P2: các định dạng output bổ sung (OBJ/STL) thông qua background conversion job.
6. Vòng QA/performance/error-boundary/observability và checklist nghiệm thu đầy đủ cho Phase 1.

Các đề xuất AI và các bản sửa liên quan đến sản xuất vẫn phải tạo ra các giá trị `EditorAction` thông thường và đi qua cùng pipeline validation của editor trước khi được áp dụng.

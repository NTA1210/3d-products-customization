# Thiết lập Supabase Storage

Pipeline asset của Phase 1 sử dụng Supabase Storage để lưu GLB nguồn bất biến và các artifact được sinh ra.

## 1. Tạo bucket riêng tư
Tạo một bucket tên `product3d` (hoặc đặt `SUPABASE_STORAGE_BUCKET` thành tên khác). Bucket phải được giữ ở chế độ private.

Các giới hạn được khuyến nghị cho bucket có thể cấu hình trong Supabase dashboard. API cũng bắt buộc input `.glb` và áp dụng giới hạn `MAX_ASSET_BYTES` có thể cấu hình trước khi cấp signed upload grant.

## 2. Cấu hình key
Sử dụng mô hình key hiện tại của Supabase:
- Trình duyệt: `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...`
- API/worker: `SUPABASE_SECRET_KEY=sb_secret_...`

Không bao giờ đưa secret key vào biến có tiền tố `NEXT_PUBLIC_` hoặc commit key này lên Git.

## 3. Luồng upload
1. Trình duyệt gọi `POST /api/assets/import`.
2. API tạo một object path bất biến và duy nhất, sau đó gọi Supabase `createSignedUploadUrl`.
3. Trình duyệt dùng Supabase `uploadToSignedUrl` với token được trả về.
4. Trình duyệt gọi `POST /api/assets/:id/analyze`.
5. BullMQ worker tải file nguồn bằng secret key chỉ dành cho server, kiểm tra/normalize file và upload sang một object path normalized mới.

Signed upload grant có thời hạn. Đường dẫn source là duy nhất cho từng asset và không bị ghi đè.

## 4. Phát triển local
`docker compose up -d` chỉ khởi động PostgreSQL và Redis. Storage vẫn sử dụng Supabase project được cấu hình để môi trường development và worker khi deploy cùng tuân theo một object-storage contract.

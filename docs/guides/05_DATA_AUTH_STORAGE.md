# 05 - Dữ liệu, xác thực và Storage

Tài liệu này giải thích PostgreSQL/Prisma, Supabase Auth và Supabase private Storage.

## 1. Cơ sở dữ liệu

Prisma schema:

```text
apps/api/prisma/schema.prisma
```

Các entity chính:

- `User`
- `ModelAsset`
- `ModelManifest`
- `Project`
- `ModelVersion`
- `MaterialPreset`
- `ComponentVariant`
- `StylePreset`
- `UserPreset`
- `ManufacturingRule`
- `ManufacturingCheck`
- `AIRequest`
- `Job`
- `RenderJob`
- `CollectionProduct`
- `Workshop`
- `QuoteRequest`
- `Quote`

## 2. Các lệnh Prisma

Tạo client:

```bash
pnpm --filter @product3d/api prisma:generate
```

Migration môi trường phát triển:

```bash
pnpm --filter @product3d/api prisma:migrate
```

Migration production:

```bash
pnpm --filter @product3d/api exec prisma migrate deploy
```

Tạo dữ liệu seed:

```bash
pnpm --filter @product3d/api prisma:seed
```

## 3. Quy tắc migration

Khi đổi schema:

1. sửa `schema.prisma`.
2. tạo migration.
3. tạo lại Prisma Client.
4. cập nhật API + worker theo cùng contract.
5. chạy test/build.
6. rollout production theo thứ tự migration → API → worker → web.

Không sửa database production thủ công rồi bỏ qua migration trong repo.

## 4. Supabase Auth

Frontend dùng `@supabase/supabase-js` với:

```env
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
```

Backend/worker dùng cấu hình phía server:

```env
SUPABASE_URL
SUPABASE_PUBLISHABLE_KEY
SUPABASE_SECRET_KEY
```

Trình duyệt đăng nhập để lấy session token. `authFetch` gắn token vào:

```http
Authorization: Bearer <access_token>
```

NestJS `SupabaseAuthGuard` xác minh token và gắn người dùng đã xác thực vào request.

## 5. Đồng bộ người dùng

Các business resource trong PostgreSQL dùng danh tính Supabase đã xác thực làm owner. Khi debug lỗi foreign key/quyền sở hữu user, kiểm tra luồng auth bootstrap và user persistence trước khi bỏ ownership check.

## 6. Supabase Storage

Bucket chuẩn là private:

```env
SUPABASE_STORAGE_BUCKET=product3d
```

Thiết lập:

```bash
pnpm --filter @product3d/api storage:setup
```

`storage:setup` tạo/xác minh bucket và áp dụng giới hạn kích thước file từ `MAX_ASSET_BYTES`.

## 7. Signed upload

Upload source GLB:

```text
Trình duyệt
→ API tạo ModelAsset + sourceObjectKey
→ API tạo signed upload grant
→ Trình duyệt upload trực tiếp vào Supabase Storage
→ Trình duyệt gọi analyze
```

Lợi ích: file lớn không cần proxy toàn bộ qua NestJS process.

## 8. Signed download

Private artifact không nên được public vĩnh viễn.

```text
DB giữ object key
→ API kiểm tra ownership
→ API tạo signed URL ngắn hạn
→ client dùng URL
```

Không lưu signed URL như canonical state vì URL sẽ hết hạn.

## 9. Namespace của object key

Ví dụ:

```text
assets/<...>/source/...
assets/<...>/normalized/model.glb
catalog/variants/...
exports/<projectId>/<jobId>/...
renders/<projectId>/<renderJobId>/...
ai-visualizations/<userId>/<projectId>/...
```

Source GLB là bất biến; normalize/export/render/AI tạo object mới.

## 10. Khi thêm loại artifact mới

1. Chọn namespace thể hiện rõ capability.
2. Server tạo object key.
3. Worker ghi artifact bằng service secret.
4. DB chỉ lưu key/resource ID.
5. Read endpoint kiểm tra ownership.
6. Read endpoint tạo signed URL mới.
7. Định nghĩa retention/cleanup policy nếu artifact có thể tích tụ.

## 11. Quản lý secret

Không bao giờ đưa các biến sau vào client bundle:

```text
SUPABASE_SECRET_KEY
OPENAI_API_KEY
DATABASE_URL
REDIS_URL
METRICS_BEARER_TOKEN
```

Các biến public hợp lệ:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
NEXT_PUBLIC_API_URL
```

## 12. Tài liệu liên quan

- [../SUPABASE_STORAGE.md](../SUPABASE_STORAGE.md)
- [../AUTH_AND_PROJECTS.md](../AUTH_AND_PROJECTS.md)
- [../PRODUCTION_DEPLOYMENT.md](../PRODUCTION_DEPLOYMENT.md)
- [04 - API Backend](04_API_BACKEND.md)

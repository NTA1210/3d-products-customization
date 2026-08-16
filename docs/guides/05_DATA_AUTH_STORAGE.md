# 05 - Data, Auth & Storage

Guide này giải thích PostgreSQL/Prisma, Supabase Auth và Supabase private Storage.

## 1. Database

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

## 2. Prisma commands

Generate client:

```bash
pnpm --filter @product3d/api prisma:generate
```

Dev migration:

```bash
pnpm --filter @product3d/api prisma:migrate
```

Production migration:

```bash
pnpm --filter @product3d/api exec prisma migrate deploy
```

Seed:

```bash
pnpm --filter @product3d/api prisma:seed
```

## 3. Migration rule

Khi đổi schema:

1. sửa `schema.prisma`.
2. tạo migration.
3. generate Prisma Client.
4. cập nhật API + worker cùng contract.
5. chạy test/build.
6. production rollout theo thứ tự migration → API → workers → web.

Không sửa database production thủ công rồi bỏ qua migration trong repo.

## 4. Supabase Auth

Frontend dùng `@supabase/supabase-js` với:

```env
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
```

Backend/worker dùng server-side configuration:

```env
SUPABASE_URL
SUPABASE_PUBLISHABLE_KEY
SUPABASE_SECRET_KEY
```

Browser sign-in lấy session token. `authFetch` gắn token vào:

```http
Authorization: Bearer <access_token>
```

NestJS `SupabaseAuthGuard` xác minh token và gắn authenticated user vào request.

## 5. User sync

Các business resource trong PostgreSQL dùng authenticated Supabase identity làm owner. Khi debug lỗi foreign key/user ownership, kiểm tra flow auth bootstrap/user persistence trước khi bỏ ownership check.

## 6. Supabase Storage

Bucket canonical là private:

```env
SUPABASE_STORAGE_BUCKET=product3d
```

Setup:

```bash
pnpm --filter @product3d/api storage:setup
```

`storage:setup` tạo/verify bucket và áp dụng file-size limit từ `MAX_ASSET_BYTES`.

## 7. Signed upload

Upload source GLB:

```text
Browser
→ API tạo ModelAsset + sourceObjectKey
→ API tạo signed upload grant
→ Browser upload trực tiếp vào Supabase Storage
→ Browser gọi analyze
```

Lợi ích: file lớn không cần proxy toàn bộ qua NestJS process.

## 8. Signed download

Private artifact không nên public vĩnh viễn.

```text
DB giữ object key
→ API kiểm tra ownership
→ API mint signed URL ngắn hạn
→ client dùng URL
```

Không persist signed URL như canonical state vì URL hết hạn.

## 9. Object key namespaces

Ví dụ:

```text
assets/<...>/source/...
assets/<...>/normalized/model.glb
catalog/variants/...
exports/<projectId>/<jobId>/...
renders/<projectId>/<renderJobId>/...
ai-visualizations/<userId>/<projectId>/...
```

Source GLB immutable; normalize/export/render/AI tạo object mới.

## 10. Khi thêm loại artifact mới

1. Chọn namespace rõ capability.
2. Server tạo object key.
3. Worker ghi artifact bằng service secret.
4. DB chỉ lưu key/resource ID.
5. Read endpoint kiểm tra ownership.
6. Read endpoint tạo signed URL mới.
7. Định nghĩa retention/cleanup policy nếu artifact có thể tích tụ.

## 11. Secret handling

Không bao giờ đưa các biến sau vào client bundle:

```text
SUPABASE_SECRET_KEY
OPENAI_API_KEY
DATABASE_URL
REDIS_URL
METRICS_BEARER_TOKEN
```

Biến public hợp lệ:

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

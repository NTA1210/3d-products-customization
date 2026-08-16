# 09 - Triển khai và vận hành

Tài liệu này là hướng dẫn sử dụng source ở production. Runbook chi tiết hơn nằm trong `docs/PRODUCTION_DEPLOYMENT.md`.

## 1. Không triển khai repo như một process duy nhất

Các runtime service độc lập:

```text
apps/web
apps/api
workers/asset-processing
workers/export
workers/render
workers/geometry
workers/ai-visualization
```

Mỗi service có thể scale/restart riêng.

## 2. Các managed service cần có

- PostgreSQL tương thích phiên bản 16.
- Redis tương thích BullMQ, dùng `noeviction`.
- Supabase Auth + private Storage.
- OpenAI nếu bật tính năng AI.

Runtime native:

- Python cho định dạng export dẫn xuất và geometry.
- Blender cho render worker.

## 3. Build production

```bash
pnpm install --frozen-lockfile
pnpm --filter @product3d/api prisma:generate
pnpm build
```

## 4. Lần deploy đầu / thiết lập database

```bash
pnpm --filter @product3d/api exec prisma migrate deploy
pnpm --filter @product3d/api storage:setup
pnpm --filter @product3d/api prisma:seed
```

Trong production lâu dài, `prisma:seed` nên được xem là bước bảo trì catalog/demo chứ không mặc định chạy lại sau mọi lần deploy nếu catalog do business quản lý.

## 5. Thứ tự rollout

Thứ tự an toàn:

```text
Prisma migration
→ API
→ worker
→ web
```

Lý do: API/worker phải hiểu schema mới trước khi web bắt đầu gửi contract mới.

Nếu đổi queue payload không tương thích ngược, cần drain queue hoặc version queue contract.

## 6. Tách môi trường

Tối thiểu nên có:

```text
local
development/staging
production
```

Không dùng lại Supabase secret/OpenAI key của production cho CI có tính xác định.

## 7. Worker concurrency

Các biến hiện có gồm:

```env
ASSET_WORKER_CONCURRENCY=2
EXPORT_WORKER_CONCURRENCY=2
RENDER_WORKER_CONCURRENCY=1
GEOMETRY_WORKER_CONCURRENCY=1
AI_VISUALIZATION_WORKER_CONCURRENCY=1
```

Blender/geometry thường nặng CPU/RAM; bắt đầu với concurrency thấp rồi đo metric trước khi tăng.

## 8. Health check

API:

```http
GET /api/health
```

Sau deploy nên chạy smoke test:

1. Đăng nhập.
2. Upload GLB fixture.
3. Asset analysis hoàn tất.
4. Lưu Manifest.
5. Tạo Project + Version.
6. Export GLB.
7. Chạy geometry check.
8. Render nếu Blender đã bật.
9. AI Suggest nếu provider đã bật.

## 9. Metrics

Endpoint:

```http
GET /api/metrics
```

Production nên đặt:

```env
METRICS_BEARER_TOKEN=<strong-random-token>
METRICS_SAMPLE_LIMIT=10000
```

Prometheus scraper gửi:

```http
Authorization: Bearer <METRICS_BEARER_TOKEN>
```

Các nhóm metric được mô tả trong [../OBSERVABILITY.md](../OBSERVABILITY.md).

## 10. Log

API/worker nên chuyển stdout/stderr vào nền tảng logging tập trung.

Khi debug job ở production, tối thiểu nên correlation theo:

- database Job ID.
- BullMQ job ID.
- project/asset ID.
- capability type.
- kết quả worker/failure reason.

Không log secret/token/private signed URL đầy đủ nếu không cần thiết.

## 11. Vận hành Storage

Private artifact phải giữ object key trong DB.

Nếu cần cho người dùng tải xuống:

```text
kiểm tra ownership
→ tạo signed URL
→ response
```

Không chuyển bucket thành public chỉ để đơn giản hóa frontend.

## 12. Xác nhận staging

Repo có workflow staging E2E chạy thủ công. Hãy cấu hình GitHub environment `staging` với:

```text
STAGING_WEB_URL
STAGING_E2E_EMAIL
STAGING_E2E_PASSWORD
```

Sau mỗi thay đổi lớn ở storage/job/export, chạy staging E2E để kiểm tra live orchestration.

## 13. Rollback

- Application service có thể rollback độc lập nếu schema/queue contract còn tương thích.
- Database rollback nên dùng corrective migration rõ ràng.
- Không tự động đảo ngược destructive migration.
- Source asset bất biến giúp rollback app mà không làm mất original GLB.

## 14. Tài liệu liên quan

- [../PRODUCTION_DEPLOYMENT.md](../PRODUCTION_DEPLOYMENT.md)
- [../OBSERVABILITY.md](../OBSERVABILITY.md)
- [05 - Dữ liệu, xác thực và Storage](05_DATA_AUTH_STORAGE.md)
- [06 - Worker và pipeline](06_WORKERS_AND_PIPELINES.md)

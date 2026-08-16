# 09 - Deployment & Operations

Guide này là bản hướng dẫn sử dụng source ở production. Runbook chi tiết hơn nằm trong `docs/PRODUCTION_DEPLOYMENT.md`.

## 1. Không deploy repo như một process duy nhất

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

## 2. Managed services cần có

- PostgreSQL 16-compatible.
- Redis compatible với BullMQ, `noeviction`.
- Supabase Auth + private Storage.
- OpenAI nếu bật AI features.

Native runtime:

- Python cho export-derived formats và geometry.
- Blender cho render worker.

## 3. Build production

```bash
pnpm install --frozen-lockfile
pnpm --filter @product3d/api prisma:generate
pnpm build
```

## 4. First deploy / database setup

```bash
pnpm --filter @product3d/api exec prisma migrate deploy
pnpm --filter @product3d/api storage:setup
pnpm --filter @product3d/api prisma:seed
```

Trong production lâu dài, `prisma:seed` nên được xem là catalog/demo maintenance chứ không mặc định chạy lại mọi deploy nếu catalog do business quản lý.

## 5. Rollout order

Thứ tự an toàn:

```text
Prisma migration
→ API
→ workers
→ web
```

Lý do: API/worker phải hiểu schema mới trước khi web bắt đầu gửi contract mới.

Nếu đổi queue payload không backward-compatible, cần drain queue hoặc version queue contract.

## 6. Environment separation

Tối thiểu nên có:

```text
local
development/staging
production
```

Không reuse production Supabase secret/OpenAI key cho CI deterministic.

## 7. Worker concurrency

Các biến hiện có gồm:

```env
ASSET_WORKER_CONCURRENCY=2
EXPORT_WORKER_CONCURRENCY=2
RENDER_WORKER_CONCURRENCY=1
GEOMETRY_WORKER_CONCURRENCY=1
AI_VISUALIZATION_WORKER_CONCURRENCY=1
```

Blender/geometry thường nặng CPU/RAM, bắt đầu concurrency thấp rồi đo metrics trước khi tăng.

## 8. Health checks

API:

```http
GET /api/health
```

Sau deploy nên smoke:

1. Sign in.
2. Upload fixture GLB.
3. Asset analysis completed.
4. Save Manifest.
5. Create Project + Version.
6. Export GLB.
7. Geometry check.
8. Render nếu Blender enabled.
9. AI Suggest nếu provider enabled.

## 9. Metrics

Endpoint:

```http
GET /api/metrics
```

Production nên set:

```env
METRICS_BEARER_TOKEN=<strong-random-token>
METRICS_SAMPLE_LIMIT=10000
```

Prometheus scraper gửi:

```http
Authorization: Bearer <METRICS_BEARER_TOKEN>
```

Metric families được mô tả trong [../OBSERVABILITY.md](../OBSERVABILITY.md).

## 10. Logs

API/workers nên forward stdout/stderr vào centralized logging platform.

Khi debug job production, correlation tối thiểu theo:

- database Job ID.
- BullMQ job ID.
- project/asset ID.
- capability type.
- worker outcome/failure reason.

Không log secret/token/private signed URL đầy đủ nếu không cần thiết.

## 11. Storage operations

Private artifact phải giữ object key trong DB.

Nếu cần user download:

```text
ownership check
→ mint signed URL
→ response
```

Không chuyển bucket sang public chỉ để đơn giản hóa frontend.

## 12. Staging certification

Repo có manual staging E2E workflow. Hãy cấu hình GitHub `staging` environment với:

```text
STAGING_WEB_URL
STAGING_E2E_EMAIL
STAGING_E2E_PASSWORD
```

Sau mỗi thay đổi lớn ở storage/job/export, chạy staging E2E để kiểm tra live orchestration.

## 13. Rollback

- App service có thể rollback độc lập nếu schema/queue contract compatible.
- Database rollback nên dùng corrective migration rõ ràng.
- Không reverse destructive migration tự động.
- Immutable source assets giúp rollback app không làm mất original GLB.

## 14. Tài liệu liên quan

- [../PRODUCTION_DEPLOYMENT.md](../PRODUCTION_DEPLOYMENT.md)
- [../OBSERVABILITY.md](../OBSERVABILITY.md)
- [05 - Data, Auth & Storage](05_DATA_AUTH_STORAGE.md)
- [06 - Workers & Pipelines](06_WORKERS_AND_PIPELINES.md)

# 04 - API Backend

Guide này dành cho developer làm NestJS API, authorization, persistence và queue producer.

## 1. Entry points

```text
apps/api/src/main.ts
apps/api/src/module.ts
apps/api/src/config.ts
```

`main.ts` bootstrap NestJS, gắn prefix `/api` và CORS. `module.ts` đăng ký controller/service của từng capability.

## 2. Cấu trúc capability

Các thư mục chính dưới `apps/api/src/`:

```text
auth/
assets/
catalog/
collection/
jobs/
manufacturing/
metrics/
prisma/
projects/
queue/
render/
storage/
workshop/
ai/
```

Khi thêm endpoint mới, ưu tiên đặt vào capability tương ứng thay vì làm `module.ts` hoặc một controller tổng quá lớn.

## 3. Authentication & authorization

Business route dùng Supabase bearer token.

Pattern:

```ts
@UseGuards(SupabaseAuthGuard)
```

Sau đó lấy user đã xác thực từ request bằng helper auth hiện có.

**Không** nhận `userId` từ browser rồi dùng nó làm authorization.

Ownership cần được kiểm tra server-side cho:

- asset.
- project.
- model version.
- export/render job.
- manufacturing check.
- RFQ/quote.

## 4. API flow chuẩn

Với operation ngắn:

```text
Controller
→ validate body/query
→ ownership check
→ Prisma/Storage/domain engine
→ response
```

Với operation dài:

```text
Controller
→ validate + ownership
→ tạo Job record
→ enqueue BullMQ
→ trả jobId ngay
```

Client poll `GET /jobs/:id` thay vì request HTTP chờ worker hoàn thành.

## 5. Validation

Repo dùng Zod ở nhiều boundary.

Nên validate:

- request body.
- Manifest/Configuration.
- structured AI response.
- editor actions.

Nếu input là business state đã có schema trong `packages/model-schema`, import schema đó thay vì viết lại object shape trong controller.

## 6. Asset API

Controller chính: `apps/api/src/assets/asset.controller.ts`.

Flow:

```text
POST /assets/import
→ create ModelAsset
→ create signed Supabase upload grant

POST /assets/:id/analyze
→ assert uploaded object exists
→ create Job
→ enqueue asset worker

GET /assets/:id/analysis
→ read persisted analysis

PUT /assets/:id/manifest
→ validate ModelManifest
→ create next manifest version
```

Source object key do server tạo; client không được quyết định canonical storage path.

## 7. Project & version API

Project giữ relation tới asset và user.

`ModelVersion` lưu `configurationJson` snapshot.

Khi load lại project, source + manifest + configuration phải đủ để tái tạo editor state. Không lưu Three.js scene serialization làm version state.

## 8. Job API

Generic Job table dùng để theo dõi capability worker.

Các trạng thái chính:

```text
QUEUED
PROCESSING
RETRYING
COMPLETED
FAILED
```

`GET /jobs/:id/artifact` chỉ nên trả signed URL khi job completed và result có artifact object key hợp lệ.

## 9. Queue services

`apps/api/src/queue/` chứa producer cho:

- asset processing.
- export.
- render.
- geometry.
- AI visualization.

Queue service nên:

- dùng stable queue name.
- có retry/backoff hợp lý.
- persist `bullmqJobId` khi cần trace.
- close connection ở module shutdown.

Queue payload là contract giữa API và worker. Khi đổi payload không backward-compatible, cần rollout API/worker có kế hoạch.

## 10. Metrics

`GET /api/metrics` xuất Prometheus text format.

Metric hiện lấy từ PostgreSQL state cho asset/job/render/export/AI/manufacturing, nên worker chạy process khác vẫn quan sát được.

Nếu set:

```env
METRICS_BEARER_TOKEN=...
```

scraper phải gửi bearer token.

`POST /api/metrics/client` nhận authenticated viewer telemetry.

## 11. Cách thêm endpoint mới

1. Xác định capability directory.
2. Tạo Zod schema request nếu cần.
3. Reuse domain schema từ `packages/*`.
4. Gắn `SupabaseAuthGuard` nếu là user resource.
5. Viết ownership query.
6. Nếu tác vụ < HTTP request lifetime hợp lý: xử lý trực tiếp.
7. Nếu nặng: tạo Job + queue.
8. Không trả service secret/object private URL trực tiếp.
9. Thêm tài liệu vào `docs/API.md`.
10. Thêm unit/integration/E2E ở layer phù hợp.

## 12. API surface đầy đủ

Danh sách route thay đổi theo feature. Xem tài liệu canonical:

- [../API.md](../API.md)

## 13. Tài liệu liên quan

- [05 - Data, Auth & Storage](05_DATA_AUTH_STORAGE.md)
- [06 - Workers & Pipelines](06_WORKERS_AND_PIPELINES.md)
- [../AUTH_AND_PROJECTS.md](../AUTH_AND_PROJECTS.md)
- [../OBSERVABILITY.md](../OBSERVABILITY.md)

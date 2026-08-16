# 04 - API Backend

Tài liệu này dành cho developer làm NestJS API, phân quyền, persistence và queue producer.

## 1. Các file bắt đầu nên đọc

```text
apps/api/src/main.ts
apps/api/src/module.ts
apps/api/src/config.ts
```

`main.ts` bootstrap NestJS, gắn prefix `/api` và CORS. `module.ts` đăng ký controller/service của từng capability.

## 2. Cấu trúc theo capability

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

## 3. Xác thực và phân quyền

Business route dùng Supabase bearer token.

Mẫu sử dụng:

```ts
@UseGuards(SupabaseAuthGuard)
```

Sau đó lấy user đã xác thực từ request bằng helper auth hiện có.

**Không** nhận `userId` từ trình duyệt rồi dùng nó làm dữ liệu phân quyền.

Quyền sở hữu cần được kiểm tra phía server cho:

- asset.
- project.
- model version.
- export/render job.
- manufacturing check.
- RFQ/quote.

## 4. Luồng API chuẩn

Với thao tác ngắn:

```text
Controller
→ kiểm tra body/query
→ kiểm tra ownership
→ Prisma/Storage/domain engine
→ response
```

Với thao tác dài:

```text
Controller
→ kiểm tra input + ownership
→ tạo Job record
→ enqueue BullMQ
→ trả jobId ngay
```

Client poll `GET /jobs/:id` thay vì giữ HTTP request chờ worker hoàn thành.

## 5. Validation

Repo dùng Zod ở nhiều boundary.

Nên kiểm tra:

- request body.
- Manifest/Configuration.
- structured AI response.
- editor action.

Nếu input là business state đã có schema trong `packages/model-schema`, import schema đó thay vì viết lại object shape trong controller.

## 6. Asset API

Controller chính: `apps/api/src/assets/asset.controller.ts`.

Luồng:

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

## 7. Project và version API

Project giữ quan hệ tới asset và user.

`ModelVersion` lưu snapshot `configurationJson`.

Khi load lại project, source + manifest + configuration phải đủ để tái tạo editor state. Không lưu serialization của Three.js scene làm version state.

## 8. Job API

Bảng Job dùng chung để theo dõi capability worker.

Các trạng thái chính:

```text
QUEUED
PROCESSING
RETRYING
COMPLETED
FAILED
```

`GET /jobs/:id/artifact` chỉ nên trả signed URL khi job đã hoàn tất và result có artifact object key hợp lệ.

## 9. Queue service

`apps/api/src/queue/` chứa producer cho:

- asset processing.
- export.
- render.
- geometry.
- AI visualization.

Queue service nên:

- dùng queue name ổn định.
- có retry/backoff hợp lý.
- lưu `bullmqJobId` khi cần trace.
- đóng connection khi module shutdown.

Queue payload là contract giữa API và worker. Khi đổi payload không tương thích ngược, cần rollout API/worker có kế hoạch.

## 10. Metrics

`GET /api/metrics` xuất định dạng text Prometheus.

Metric hiện lấy từ PostgreSQL state cho asset/job/render/export/AI/manufacturing, nên vẫn quan sát được worker chạy ở process khác.

Nếu đặt:

```env
METRICS_BEARER_TOKEN=...
```

scraper phải gửi bearer token.

`POST /api/metrics/client` nhận viewer telemetry có xác thực.

## 11. Cách thêm endpoint mới

1. Xác định thư mục capability.
2. Tạo Zod schema cho request nếu cần.
3. Tái sử dụng domain schema từ `packages/*`.
4. Gắn `SupabaseAuthGuard` nếu là tài nguyên người dùng.
5. Viết ownership query.
6. Nếu tác vụ đủ nhẹ để xử lý trong vòng đời HTTP request: xử lý trực tiếp.
7. Nếu tác vụ nặng: tạo Job + queue.
8. Không trả service secret/private object URL trực tiếp.
9. Bổ sung tài liệu vào `docs/API.md`.
10. Thêm unit/integration/E2E ở layer phù hợp.

## 12. Toàn bộ bề mặt API

Danh sách route thay đổi theo feature. Xem tài liệu chuẩn:

- [../API.md](../API.md)

## 13. Tài liệu liên quan

- [05 - Dữ liệu, xác thực và Storage](05_DATA_AUTH_STORAGE.md)
- [06 - Worker và pipeline](06_WORKERS_AND_PIPELINES.md)
- [../AUTH_AND_PROJECTS.md](../AUTH_AND_PROJECTS.md)
- [../OBSERVABILITY.md](../OBSERVABILITY.md)

# Bề mặt API

Base URL: `/api`

Các route nghiệp vụ có xác thực sử dụng Supabase bearer token. Tài nguyên project/model/version/render/manufacturing/RFQ được server xác định theo người dùng đã xác thực; API không tin cậy user ID do trình duyệt tự truyền lên để cấp quyền.

## Health và xác thực

- `GET /health` — kiểm tra trạng thái service.
- Các route bootstrap/session liên quan đến xác thực được cung cấp bởi auth controller dựa trên Supabase; web app xác thực với Supabase và gửi bearer token tới các API route được bảo vệ.

## Pipeline asset

### `POST /assets/import`

Tạo một `ModelAsset` thuộc sở hữu người dùng ở trạng thái `AWAITING_UPLOAD` và trả về signed upload grant của Supabase Storage. Phase 1 chấp nhận GLB làm input chuẩn cho editor. Metadata file được kiểm tra ở server và `MAX_ASSET_BYTES` có thể cấu hình.

### `POST /assets/:id/analyze`
### `POST /assets/:id/normalize`

Đưa công việc vào hàng đợi asset-processing worker:

`private Supabase source → Khronos validation → phân tích scene/mesh/primitive → candidate island hình học rời rạc → cảnh báo chất lượng model → glTF Transform normalization → kiểm tra lại → normalized GLB riêng tư + kết quả PostgreSQL`

Kết nối hình học chỉ được báo cáo dưới dạng candidate region; hệ thống không khẳng định đây là semantic segmentation chỉ dựa trên connectivity.

### Các route đọc asset

- `GET /assets/:id`
- `GET /assets/:id/analysis`
- `GET /assets/:id/download?kind=source|normalized`
- `GET /assets/:id/manifest`
- `PUT /assets/:id/manifest`

Download sử dụng signed URL có thời hạn ngắn cho bucket Supabase riêng tư.

## Job và artifact

- `GET /jobs/:id` — trạng thái bền vững `QUEUED | PROCESSING | RETRYING | COMPLETED | FAILED`.
- `GET /jobs/:id/artifact` — signed URL có thời hạn ngắn cho completed private artifact khi kết quả job có object key.

Các tác vụ chạy dài như phân tích/export GLB, Blender render, geometry analysis và AI visualization chạy thông qua BullMQ worker.

## Project và version

- `GET /projects`
- `POST /projects`
- `GET /projects/:id`
- `PUT /projects/:id`
- `POST /projects/:id/versions`
- `GET /projects/:id/versions`
- `POST /projects/:id/duplicate`

Một `ModelVersion` lưu snapshot configuration có thể serialize; nó không nhân bản source GLB bất biến.

## Export

### `POST /projects/:id/export`

Body có thể chứa `versionId` đã lưu hoặc `configurationJson` hiện tại hợp lệ và tùy chọn:

```json
{"format":"GLB"}
```

Các định dạng hỗ trợ:

- `GLB` — export tùy chỉnh đầy đủ độ trung thực và là định dạng chuẩn. Kích thước/transform/material/color/delete/visibility của component và việc thay variant từ catalog được bake vào output. GLB cuối cùng được Khronos kiểm tra trước khi lưu.
- `OBJ` — được suy ra từ customized GLB đã bake và xuất theo tọa độ millimeter. Hiện chưa xuất texture sidecar.
- `STL` — artifact chỉ gồm geometry, theo tọa độ millimeter.

Source GLB gốc không bao giờ bị ghi đè.

## Material, variant, style và preset

- `GET /materials`
- `GET /variants` với filter catalog như group/role.
- `GET /styles`
- các route list/create/delete user preset có xác thực dưới `/presets`.

Binary của variant vẫn là private; response catalog sẽ hydrate signed URL có thời hạn ngắn khi editor cần.

## Render / 360

### `POST /render-jobs`

Yêu cầu một completed GLB export thuộc cùng user/project. Các mode hỗ trợ:

- `MULTI_VIEW` — sáu góc nhìn cho catalog/phân tích thiết kế.
- `SPIN_360` — 12–120 frame.

Các mức quality: `DRAFT | STANDARD | HIGH`.

Route bổ sung:

- `GET /render-jobs/:id`
- `GET /render-jobs/:id/assets` — signed PNG URL sau khi hoàn tất.

Render được Blender worker thực hiện trên cấu hình hiện tại đã export.

## AI

Base: `/projects/:projectId/ai`

### `POST .../design-suggestions`

Yêu cầu configuration hiện tại đã được kiểm tra cùng một completed project `MULTI_VIEW` render. Server cung cấp metadata model, các component/material/variant/style ID hợp lệ và context constraint cho provider đã cấu hình. Output của provider phải đúng structured schema; các action đề xuất được kiểm tra với catalog ID, manifest rule, constraint và compatibility trước khi người dùng có thể áp dụng.

Quota theo giờ được thực thi ở server. API key không bao giờ được gửi tới trình duyệt.

### `POST .../visualizations`

Yêu cầu một completed render thuộc project hiện tại. Endpoint đưa một image-edit job vào hàng đợi phía server, sử dụng product render làm reference, lưu PNG được tạo vào Supabase Storage riêng tư và cung cấp nó thông qua generic job artifact endpoint.

## Khả năng sản xuất

Base: `/projects/:projectId/manufacturability`

- `POST .../check` — chạy các rule xác định trên manifest + configuration/material metadata hiện tại; lưu issue.
- `POST .../geometry` — yêu cầu completed current-project GLB export và đưa Trimesh geometry analysis vào hàng đợi.
- `GET .../checks/:checkId` — kết quả deterministic + geometry đã lưu.

Geometry analysis chạy trên customized export, không phải source model bất biến.

## Đề xuất collection

### `POST /projects/:projectId/collection/recommendations`

Xếp hạng V1 theo cách xác định. Source profile được suy ra từ configuration/manifest hiện tại cùng metadata tùy chọn. Trọng số theo specification:

- style: 50%
- material: 25%
- color: 15%
- metadata khác về category/component: 10%

Endpoint trả về score và breakdown cho từng recommendation.

## Workshop / RFQ / Quote

- `GET /workshops`
- `POST /projects/:projectId/rfq`
- `GET /projects/:projectId/rfq`
- `GET /rfq/:id`
- `POST /rfq/:id/quotes`
- `PATCH /rfq/:id/status`

Khi tạo RFQ, hệ thống xác minh saved model version, GLB export, manufacturing check tùy chọn và render tùy chọn đều thuộc authenticated project/user. RFQ payload chuẩn lưu object key/resource ID của Supabase thay vì URL hết hạn; các route read sẽ hydrate signed preview/export URL mới.

Vòng đời RFQ được triển khai trong Phase 1:

`SUBMITTED → RECEIVED → ACCEPTED | REJECTED`

Nếu có `expiresAt`, các request `SUBMITTED` hoặc `RECEIVED` quá hạn sẽ chuyển sang `EXPIRED` trước khi đọc RFQ hoặc thực hiện mutation quote/status.

## Ghi chú storage/bảo mật

- Supabase Storage bucket là private.
- Trình duyệt chỉ nhận publishable key cùng signed grant/URL có thời hạn ngắn.
- `SUPABASE_SECRET_KEY` và `OPENAI_API_KEY` chỉ tồn tại ở server/worker.
- Source GLB là bất biến; normalization/render/export/AI output tạo artifact riêng.
- Structured AI output và editor action đều được kiểm tra; xử lý công thức dependency/manufacturing không sử dụng `eval` tùy ý.

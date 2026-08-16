# 06 - Worker và pipeline

Các tác vụ dài của hệ thống chạy qua Redis/BullMQ. Mỗi worker là một process độc lập và có thể scale riêng.

## 1. Danh sách worker

| Worker | Package | Nhiệm vụ chính | Dependency native/runtime |
|---|---|---|---|
| Asset Processing | `@product3d/asset-processing-worker` | Validate/analyze/normalize GLB | Node, Draco, Meshopt, Khronos validator |
| Export | `@product3d/export-worker` | Bake customized GLB, ghép variant, OBJ/STL | Node; Python cho OBJ/STL |
| Render | `@product3d/render-worker` | Multi-view / spin-360 | Blender |
| Geometry | `@product3d/geometry-worker` | Dữ kiện/issue geometry bằng Trimesh | Python + numpy/trimesh/networkx |
| AI Visualization | `@product3d/ai-visualization-worker` | Hàng đợi lifestyle visualization | OpenAI + Supabase |

## 2. Hạ tầng dùng chung

Worker sử dụng:

```env
DATABASE_URL=...
REDIS_URL=...
SUPABASE_URL=...
SUPABASE_SECRET_KEY=...
SUPABASE_STORAGE_BUCKET=product3d
```

Mỗi worker nhận BullMQ job payload, cập nhật bản ghi `Job` trong PostgreSQL và ghi output artifact vào Supabase khi cần.

## 3. Chạy worker ở môi trường phát triển

Asset:

```bash
pnpm --filter @product3d/asset-processing-worker dev
```

Export:

```bash
pnpm --filter @product3d/export-worker dev
```

Render:

```bash
pnpm --filter @product3d/render-worker dev
```

Geometry:

```bash
pnpm --filter @product3d/geometry-worker dev
```

AI visualization:

```bash
pnpm --filter @product3d/ai-visualization-worker dev
```

Build + start production cho từng package:

```bash
pnpm --filter <package-name> build
pnpm --filter <package-name> start
```

## 4. Asset-processing worker

Source:

```text
workers/asset-processing/src/
```

Pipeline:

```text
source GLB từ Supabase
→ Khronos validation
→ source-index analysis
→ mesh / primitive / disconnected island candidate
→ cảnh báo chất lượng
→ glTF Transform normalize
→ Khronos validation lần 2
→ normalized GLB
→ Supabase + analysis trong PostgreSQL
```

Hỗ trợ Draco/Meshopt tại boundary load/transform.

Không ghi đè source GLB.

## 5. Export worker

Source:

```text
workers/export/src/
workers/export/convert.py
```

Luồng chuẩn:

```text
source GLB
+ Manifest
+ Configuration
+ material
+ component variant
→ bake dimension/transform/material/color/visibility/delete
→ ghép variant replacement
→ đặt vị trí toàn bộ model
→ GLB
→ Khronos validate
→ private export artifact
```

OBJ/STL được tạo **sau** khi customized GLB đã được bake.

Cài dependency Python cho bước chuyển đổi:

```bash
python -m pip install -r workers/export/requirements.txt
```

## 6. Render worker

Source:

```text
workers/render/src/
workers/render/render.py
```

Yêu cầu:

```env
BLENDER_BIN=blender
```

Render job chỉ nên nhận completed GLB export của đúng user/project.

Các mode hiện tại:

- `MULTI_VIEW`
- `SPIN_360`

Worker gọi Blender headless để tạo PNG frame rồi upload artifact.

## 7. Geometry worker

Source:

```text
workers/geometry/src/
workers/geometry/analyze.py
```

Cài đặt:

```bash
python -m pip install -r workers/geometry/requirements.txt
```

Python analyzer đọc **customized exported GLB**, không đọc source model, và trả các dữ kiện như:

- số vertex/face.
- số body rời rạc.
- trạng thái watertight.
- extents/bounds.
- Euler number.
- volume khi phù hợp.

Nó cũng có thể tạo issue như `geometry:not-watertight` hoặc `geometry:multiple-bodies`.

CI hiện chạy analyzer thật trên 4 GLB fixture.

## 8. AI visualization worker

Worker này xử lý lifestyle visualization ở phía server.

Input phải tham chiếu render/current product artifact; output là một derivative image riêng trong Supabase Storage. Nó **không** thay đổi canonical 3D state.

OpenAI key phải ở server/worker:

```env
OPENAI_API_KEY=...
```

## 9. Retry / lỗi

Worker cần cập nhật Job state nhất quán:

```text
QUEUED
→ PROCESSING
→ COMPLETED
```

Khi lỗi/retry:

```text
PROCESSING → RETRYING → PROCESSING
PROCESSING → FAILED
```

`failureReason` nên chứa message đủ để debug nhưng không làm lộ secret.

## 10. Khi thêm worker mới

1. Tạo package dưới `workers/<capability>`.
2. Thêm package vào pnpm workspace nếu chưa được auto-match.
3. Định nghĩa queue name ổn định.
4. Tạo queue producer trong `apps/api/src/queue/`.
5. Tạo `Job` bền vững trước khi enqueue.
6. Worker cập nhật vòng đời Job.
7. Artifact dùng Supabase private Storage + object key.
8. Bổ sung cách cài native dependency vào tài liệu deployment.
9. Thêm syntax/runtime smoke test nếu có Python/native tool.
10. Thêm metric theo job type và đường troubleshooting.

## 11. Tài liệu liên quan

- [../ARCHITECTURE.md](../ARCHITECTURE.md)
- [../EXPORT.md](../EXPORT.md)
- [../PRODUCTION_DEPLOYMENT.md](../PRODUCTION_DEPLOYMENT.md)
- [07 - Các khả năng nâng cao](07_ADVANCED_CAPABILITIES.md)

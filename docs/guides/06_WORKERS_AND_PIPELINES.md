# 06 - Workers & Pipelines

Các tác vụ dài của hệ thống chạy qua Redis/BullMQ. Mỗi worker là một process độc lập và có thể scale riêng.

## 1. Worker list

| Worker | Package | Nhiệm vụ chính | Native/runtime dependency |
|---|---|---|---|
| Asset Processing | `@product3d/asset-processing-worker` | Validate/analyze/normalize GLB | Node, Draco, Meshopt, Khronos validator |
| Export | `@product3d/export-worker` | Bake customized GLB, variant composition, OBJ/STL | Node; Python cho OBJ/STL |
| Render | `@product3d/render-worker` | Multi-view / spin-360 | Blender |
| Geometry | `@product3d/geometry-worker` | Trimesh geometry facts/issues | Python + numpy/trimesh/networkx |
| AI Visualization | `@product3d/ai-visualization-worker` | Lifestyle visualization queue | OpenAI + Supabase |

## 2. Common infrastructure

Workers dùng:

```env
DATABASE_URL=...
REDIS_URL=...
SUPABASE_URL=...
SUPABASE_SECRET_KEY=...
SUPABASE_STORAGE_BUCKET=product3d
```

Mỗi worker nhận BullMQ job payload, cập nhật `Job` record trong PostgreSQL và ghi output artifact vào Supabase khi cần.

## 3. Chạy worker ở dev

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

Build + start production của từng package:

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
→ mesh / primitive / disconnected island candidates
→ quality warnings
→ glTF Transform normalize
→ Khronos validation lần 2
→ normalized GLB
→ Supabase + PostgreSQL analysis
```

Hỗ trợ Draco/Meshopt ở load/transform boundary.

Không overwrite source GLB.

## 5. Export worker

Source:

```text
workers/export/src/
workers/export/convert.py
```

Canonical flow:

```text
source GLB
+ Manifest
+ Configuration
+ materials
+ component variants
→ bake dimensions/transforms/material/color/visibility/delete
→ composite variant replacement
→ whole-model placement
→ GLB
→ Khronos validate
→ private export artifact
```

OBJ/STL được derive **sau** khi customized GLB đã bake.

Cài Python conversion dependencies:

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

Modes hiện tại:

- `MULTI_VIEW`
- `SPIN_360`

Worker gọi Blender headless để tạo PNG frames rồi upload artifact.

## 7. Geometry worker

Source:

```text
workers/geometry/src/
workers/geometry/analyze.py
```

Cài:

```bash
python -m pip install -r workers/geometry/requirements.txt
```

Python analyzer đọc **customized exported GLB**, không source model, và trả facts như:

- vertex/face count.
- disconnected body count.
- watertight state.
- extents/bounds.
- Euler number.
- volume khi phù hợp.

Nó cũng có thể sinh issue như `geometry:not-watertight` hoặc `geometry:multiple-bodies`.

CI hiện chạy analyzer thật trên 4 GLB fixtures.

## 8. AI visualization worker

Worker này xử lý lifestyle visualization server-side.

Input phải tham chiếu render/current product artifact; output là derivative image riêng trong Supabase Storage. Nó **không** thay đổi canonical 3D state.

OpenAI key phải ở server/worker:

```env
OPENAI_API_KEY=...
```

## 9. Retry / failure

Worker cần update Job state nhất quán:

```text
QUEUED
→ PROCESSING
→ COMPLETED
```

Failure/retry:

```text
PROCESSING → RETRYING → PROCESSING
PROCESSING → FAILED
```

`failureReason` nên chứa message đủ debug nhưng không leak secret.

## 10. Khi thêm worker mới

1. Tạo package dưới `workers/<capability>`.
2. Thêm package vào pnpm workspace nếu chưa auto-match.
3. Định nghĩa queue name ổn định.
4. Tạo queue producer trong `apps/api/src/queue/`.
5. Tạo persistent `Job` trước khi enqueue.
6. Worker cập nhật Job lifecycle.
7. Artifact dùng Supabase private Storage + object key.
8. Thêm native dependency setup vào deployment docs.
9. Thêm syntax/runtime smoke test nếu có Python/native tool.
10. Thêm metric job type và troubleshooting path.

## 11. Tài liệu liên quan

- [../ARCHITECTURE.md](../ARCHITECTURE.md)
- [../EXPORT.md](../EXPORT.md)
- [../PRODUCTION_DEPLOYMENT.md](../PRODUCTION_DEPLOYMENT.md)
- [07 - Advanced Capabilities](07_ADVANCED_CAPABILITIES.md)

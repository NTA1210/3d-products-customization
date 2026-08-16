# Source Code Guide

Tài liệu này là **điểm bắt đầu** để đọc, chạy và mở rộng toàn bộ source code của 3D Product Customization Platform.

Không nên đọc repo bằng cách mở từng file ngẫu nhiên. Hãy đi theo thứ tự bên dưới. Mỗi chủ đề được tách thành một file riêng để dễ bảo trì khi source thay đổi.

## Đọc theo mục tiêu

| Bạn muốn làm gì? | Tài liệu nên đọc |
|---|---|
| Chạy project lần đầu | [01 - Getting Started](guides/01_GETTING_STARTED.md) |
| Hiểu monorepo và luồng dữ liệu | [02 - Repository & Architecture](guides/02_REPOSITORY_AND_ARCHITECTURE.md) |
| Sửa UI/editor/Three.js | [03 - Web Editor](guides/03_WEB_EDITOR.md) |
| Thêm/sửa API NestJS | [04 - API Backend](guides/04_API_BACKEND.md) |
| Làm PostgreSQL, Prisma, Supabase | [05 - Data, Auth & Storage](guides/05_DATA_AUTH_STORAGE.md) |
| Chạy/sửa background workers | [06 - Workers & Pipelines](guides/06_WORKERS_AND_PIPELINES.md) |
| AI, render, manufacturability, AR, RFQ | [07 - Advanced Capabilities](guides/07_ADVANCED_CAPABILITIES.md) |
| Chạy test / hiểu CI | [08 - Testing & CI](guides/08_TESTING_AND_CI.md) |
| Deploy production | [09 - Deployment & Operations](guides/09_DEPLOYMENT_AND_OPERATIONS.md) |
| Debug lỗi thường gặp | [10 - Troubleshooting](guides/10_TROUBLESHOOTING.md) |
| Thêm feature mới đúng kiến trúc | [11 - Extension Guide](guides/11_EXTENSION_GUIDE.md) |

## Thứ tự đọc khuyến nghị cho developer mới

1. [Getting Started](guides/01_GETTING_STARTED.md)
2. [Repository & Architecture](guides/02_REPOSITORY_AND_ARCHITECTURE.md)
3. Chọn nhánh làm việc:
   - Frontend: [Web Editor](guides/03_WEB_EDITOR.md)
   - Backend: [API Backend](guides/04_API_BACKEND.md) → [Data, Auth & Storage](guides/05_DATA_AUTH_STORAGE.md)
4. [Workers & Pipelines](guides/06_WORKERS_AND_PIPELINES.md)
5. [Testing & CI](guides/08_TESTING_AND_CI.md)
6. [Deployment & Operations](guides/09_DEPLOYMENT_AND_OPERATIONS.md)

## Tài liệu chuyên sâu đã có trong repo

Bộ guide này **không thay thế** các tài liệu kỹ thuật hiện hữu. Khi cần chi tiết sâu hơn, xem:

- [ARCHITECTURE.md](ARCHITECTURE.md) — source of truth, mutation pipeline, storage/job/export boundaries.
- [API.md](API.md) — HTTP surface hiện tại.
- [SUPABASE_STORAGE.md](SUPABASE_STORAGE.md) — private bucket và signed URL flow.
- [AUTH_AND_PROJECTS.md](AUTH_AND_PROJECTS.md) — auth/project/version behavior.
- [EXPORT.md](EXPORT.md) — customized GLB, OBJ, STL.
- [VARIANTS_PRESETS.md](VARIANTS_PRESETS.md) — variant/style/preset rules.
- [OPENAI_PROVIDER.md](OPENAI_PROVIDER.md) — provider configuration.
- [OBSERVABILITY.md](OBSERVABILITY.md) — Prometheus metrics và viewer telemetry.
- [PRODUCTION_DEPLOYMENT.md](PRODUCTION_DEPLOYMENT.md) — deployment runbook.
- [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md) — feature/evidence matrix.
- [PHASE1_GAP_AUDIT.md](PHASE1_GAP_AUDIT.md) — Definition-of-Done và runtime evidence gaps.

## Nguyên tắc không được phá khi sửa source

- **Original GLB là immutable.** Không overwrite source asset.
- **Three.js scene không phải business state.** Business state là Manifest + Configuration + ModelVersion.
- Manual / Preset / Style / AI đều phải tạo **structured EditorAction** rồi đi qua schema, constraint, compatibility, dependency và apply pipeline.
- Không bypass Action/Constraint/Compatibility pipeline để mutate trực tiếp scene.
- Không lưu signed URL hết hạn vào DB như canonical state; lưu object key/ID và tạo signed URL khi cần.
- Browser chỉ dùng Supabase publishable key. `SUPABASE_SECRET_KEY` và `OPENAI_API_KEY` chỉ ở server/worker.
- Tác vụ dài phải chạy qua BullMQ worker; không giữ HTTP request chờ Blender/Trimesh/export/AI hoàn tất.
- Khi thêm feature mới, bổ sung test phù hợp và giữ Chromium critical-flow CI xanh.

## Trạng thái hiện tại

Phase 1 hiện feature-complete ở mức code với deterministic browser E2E, native Trimesh runtime CI và Prometheus-compatible metrics. Các phần cần môi trường thật như live Supabase/Redis orchestration, Blender, OpenAI và mobile AR được theo dõi trong [PHASE1_GAP_AUDIT.md](PHASE1_GAP_AUDIT.md).

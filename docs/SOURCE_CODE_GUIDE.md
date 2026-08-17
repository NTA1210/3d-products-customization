# Hướng dẫn sử dụng source code

Tài liệu này là **điểm bắt đầu** để đọc, chạy và mở rộng toàn bộ source code của 3D Product Customization Platform.

Không nên đọc repo bằng cách mở từng file ngẫu nhiên. Hãy đi theo thứ tự bên dưới. Mỗi chủ đề được tách thành một file riêng để dễ bảo trì khi source thay đổi.

## Đọc theo mục tiêu

| Bạn muốn làm gì? | Tài liệu nên đọc |
|---|---|
| Chạy project lần đầu | [01 - Bắt đầu](guides/01_GETTING_STARTED.md) |
| Kết nối database Supabase | [Supabase Database](SUPABASE_DATABASE.md) |
| Hiểu monorepo và luồng dữ liệu | [02 - Repository và kiến trúc](guides/02_REPOSITORY_AND_ARCHITECTURE.md) |
| Sửa UI/editor/Three.js | [03 - Web Editor](guides/03_WEB_EDITOR.md) |
| Thêm/sửa API NestJS | [04 - API Backend](guides/04_API_BACKEND.md) |
| Làm Prisma, Supabase Database/Auth/Storage | [05 - Dữ liệu, xác thực và Storage](guides/05_DATA_AUTH_STORAGE.md) |
| Chạy/sửa background worker | [06 - Worker và pipeline](guides/06_WORKERS_AND_PIPELINES.md) |
| AI, render, manufacturability, AR, RFQ | [07 - Các khả năng nâng cao](guides/07_ADVANCED_CAPABILITIES.md) |
| Chạy test / hiểu CI | [08 - Kiểm thử và CI](guides/08_TESTING_AND_CI.md) |
| Deploy production | [09 - Triển khai và vận hành](guides/09_DEPLOYMENT_AND_OPERATIONS.md) |
| Debug lỗi thường gặp | [10 - Xử lý sự cố](guides/10_TROUBLESHOOTING.md) |
| Thêm feature mới đúng kiến trúc | [11 - Hướng dẫn mở rộng](guides/11_EXTENSION_GUIDE.md) |
| Gắn part, semantic anchor, Snap/Attach | [12 - Anchors, Snap và Attach](guides/12_ANCHORS_SNAP_ATTACH.md) |
| Editor chrome, component labels và shortcut | [13 - Editor UI và Shortcuts](guides/13_EDITOR_UI_AND_SHORTCUTS.md) |

## Thứ tự đọc khuyến nghị cho developer mới

1. [Bắt đầu](guides/01_GETTING_STARTED.md)
2. [Supabase Database](SUPABASE_DATABASE.md)
3. [Repository và kiến trúc](guides/02_REPOSITORY_AND_ARCHITECTURE.md)
4. Chọn nhánh làm việc:
   - Frontend: [Web Editor](guides/03_WEB_EDITOR.md) → [Editor UI và Shortcuts](guides/13_EDITOR_UI_AND_SHORTCUTS.md)
   - Backend: [API Backend](guides/04_API_BACKEND.md) → [Dữ liệu, xác thực và Storage](guides/05_DATA_AUTH_STORAGE.md)
5. [Worker và pipeline](guides/06_WORKERS_AND_PIPELINES.md)
6. [Kiểm thử và CI](guides/08_TESTING_AND_CI.md)
7. [Triển khai và vận hành](guides/09_DEPLOYMENT_AND_OPERATIONS.md)

## Tài liệu chuyên sâu đã có trong repo

Bộ guide này **không thay thế** các tài liệu kỹ thuật hiện hữu. Khi cần chi tiết sâu hơn, xem:

- [ARCHITECTURE.md](ARCHITECTURE.md) — nguồn dữ liệu chuẩn, mutation pipeline và ranh giới storage/job/export.
- [API.md](API.md) — bề mặt HTTP hiện tại.
- [SUPABASE_DATABASE.md](SUPABASE_DATABASE.md) — `DATABASE_URL`, Supavisor và Prisma trên Supabase Database.
- [SUPABASE_STORAGE.md](SUPABASE_STORAGE.md) — private bucket và luồng signed URL.
- [AUTH_AND_PROJECTS.md](AUTH_AND_PROJECTS.md) — hành vi auth/project/version.
- [EXPORT.md](EXPORT.md) — customized GLB, OBJ, STL.
- [VARIANTS_PRESETS.md](VARIANTS_PRESETS.md) — quy tắc variant/style/preset.
- [OPENAI_PROVIDER.md](OPENAI_PROVIDER.md) — cấu hình nhà cung cấp AI.
- [OBSERVABILITY.md](OBSERVABILITY.md) — metric Prometheus và viewer telemetry.
- [PRODUCTION_DEPLOYMENT.md](PRODUCTION_DEPLOYMENT.md) — runbook triển khai.
- [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md) — ma trận tính năng/bằng chứng.
- [PHASE1_GAP_AUDIT.md](PHASE1_GAP_AUDIT.md) — Definition-of-Done và các khoảng trống bằng chứng runtime.

## Nguyên tắc không được phá khi sửa source

- **Original GLB là immutable.** Không overwrite source asset.
- **Three.js scene không phải business state.** Business state là Manifest + Configuration + ModelVersion.
- Manual / Preset / Style / AI đều phải tạo **structured EditorAction** rồi đi qua schema, constraint, compatibility, dependency và apply pipeline.
- Không bypass Action/Constraint/Compatibility pipeline để mutate trực tiếp scene.
- **Attachment là business state, không phải Three.js hierarchy.** Component editable phải tiếp tục là runtime siblings; không re-parent mesh để biểu diễn việc gắn part.
- Không lưu signed URL hết hạn vào DB như canonical state; lưu object key/ID và tạo signed URL khi cần.
- Browser chỉ dùng Supabase publishable key. `DATABASE_URL`, `SUPABASE_SECRET_KEY` và `OPENAI_API_KEY` chỉ ở server/worker.
- Tác vụ dài phải chạy qua BullMQ worker; không giữ HTTP request chờ Blender/Trimesh/export/AI hoàn tất.
- Khi thêm feature mới, bổ sung test phù hợp và giữ Chromium critical-flow CI xanh.

## Trạng thái hiện tại

Phase 1 hiện hoàn tất tính năng ở mức code với browser E2E có tính xác định, native Trimesh runtime CI và metric tương thích Prometheus. Database/Auth/Storage dùng Supabase; Redis vẫn dùng cho BullMQ. Các phần cần môi trường thật như live Supabase/Redis orchestration, Blender, OpenAI và mobile AR được theo dõi trong [PHASE1_GAP_AUDIT.md](PHASE1_GAP_AUDIT.md).

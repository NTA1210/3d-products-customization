# Nền tảng tùy chỉnh sản phẩm 3D

Bản triển khai Phase 1 theo hướng production của một **3D product configurator lấy asset khách hàng làm trung tâm**. 3D chuẩn của hệ thống đến từ asset GLB do khách hàng cung cấp; AI không sinh hoặc thay thế model 3D cốt lõi. Điều khiển thủ công, style/preset và đề xuất AI đều được chuyển thành editor action có cấu trúc, sau đó phải đi qua schema validation, constraint validation và compatibility validation trước khi thay đổi business state.

## Tài liệu source code

Nếu bạn mới vào repository hoặc cần biết **cách chạy, đọc, sửa và mở rộng toàn bộ source code**, bắt đầu tại:

**[`docs/SOURCE_CODE_GUIDE.md`](docs/SOURCE_CODE_GUIDE.md)**

Guide chính đóng vai trò mục lục và dẫn tới các tài liệu riêng theo chủ đề: setup local, kiến trúc, web editor, API, database/Supabase, worker, AI/render/manufacturing, testing/CI, deployment, troubleshooting và hướng dẫn mở rộng.

## Các khả năng đã triển khai

- Supabase Auth và private Supabase Storage với signed upload/download grant có thời hạn ngắn.
- Import GLB, Khronos validation, glTF Transform normalization, stable glTF source-index ID và phân tích candidate geometry-island rời rạc.
- Asset Preparation với cấu hình semantic role/editability/axis/range/material/variant/dependency và manifest được lưu bền vững.
- Luồng Place → Lock → Customize.
- Chọn/highlight component, dimension/position/rotation, material/color, delete/restore/reset và chuyển đổi đơn vị (`mm`, `cm`, `inch`).
- Pipeline dùng chung Action / Constraint / Compatibility / Dependency với Undo/Redo và state có thể serialize.
- Component variant với metadata anchor/auto-fit; transaction cho style và user preset.
- Project dùng Supabase, version configuration chính xác, reload và duplicate.
- Export customized GLB có hỗ trợ variant và Khronos re-validation; export OBJ/STL dẫn xuất theo tọa độ millimeter.
- Blender multi-view và spin-360 render job; AR preview theo configuration hiện tại.
- Structured AI Design Suggest action với quota/provider call ở server và validation trước khi áp dụng.
- Lifestyle visualization phía server dùng current product render làm reference, lưu trong private Supabase Storage.
- Deterministic manufacturability rule cùng Trimesh geometry analysis trên GLB hiện tại đã export.
- Deterministic collection recommendation V1 và luồng persistence Workshop / RFQ / Quote.
- Dọn GPU resource/error boundary, bốn nhóm GLB fixture bắt buộc, domain/integration test và CI build.

## Cấu trúc repository

- `apps/web` — editor Next.js + React Three Fiber.
- `apps/api` — NestJS + Prisma API.
- `packages/*` — domain schema và các editor/rule engine có tính xác định.
- `workers/asset-processing` — validation, analysis và normalization GLB.
- `workers/export` — bake customized GLB, ghép variant và chuyển đổi OBJ/STL.
- `workers/render` — Blender catalog/multi-view/360 rendering.
- `workers/geometry` — phân tích khả năng sản xuất geometry bằng Trimesh.
- `workers/ai-visualization` — lifestyle image generation qua hàng đợi.
- `examples/fixtures` — các kịch bản model-quality/test bắt buộc.
- `docs` — kiến trúc, API, deployment, source guide và status/audit Phase 1.

## Yêu cầu local

- Node.js 22 và pnpm 9.x.
- Docker cho PostgreSQL + Redis local, hoặc managed service tương đương.
- Một Supabase project cho Auth + private Storage.
- Python 3 cho geometry analysis và export dẫn xuất OBJ/STL.
- Blender cho render/360 job.
- OpenAI API access chỉ khi bật AI Suggest / lifestyle visualization.

Supabase thay thế hướng phát triển MinIO/S3 trước đây. Trình duyệt chỉ dùng Supabase publishable key; `SUPABASE_SECRET_KEY` chỉ ở phía server.

## Thiết lập local

1. Copy `.env.example` thành `.env` và điền giá trị Supabase.
2. Khởi động dependency database/queue local:

   ```bash
   docker compose up -d
   ```

3. Cài dependency Node:

   ```bash
   pnpm install
   ```

4. Chuẩn bị Prisma và database:

   ```bash
   pnpm --filter @product3d/api prisma:generate
   pnpm --filter @product3d/api prisma:migrate
   pnpm --filter @product3d/api storage:setup
   pnpm --filter @product3d/api prisma:seed
   ```

5. Với geometry worker và OBJ/STL worker:

   ```bash
   python -m pip install -r workers/geometry/requirements.txt
   python -m pip install -r workers/export/requirements.txt
   ```

6. Đảm bảo Blender có thể gọi bằng lệnh `blender` hoặc đặt `BLENDER_BIN` nếu cần render job.
7. Khởi động TypeScript workspace cho môi trường phát triển:

   ```bash
   pnpm dev
   ```

Web: `http://localhost:3000`  
API: `http://localhost:4000/api`

Background worker là các process độc lập và cần được start/deploy cho những capability bạn muốn sử dụng. Xem [`docs/PRODUCTION_DEPLOYMENT.md`](docs/PRODUCTION_DEPLOYMENT.md) để biết cách triển khai production và bố trí native dependency.

## Ranh giới kiểm chứng

CI chính hiện kiểm tra Prisma generation, syntax Python worker, thực thi Trimesh geometry analysis trên cả bốn GLB fixture bắt buộc, coverage domain/integration bằng Vitest, production workspace build và Playwright/Chromium critical-flow E2E.

Browser CI chủ động mock network boundary bên ngoài của Supabase/API để regression test có tính xác định. Một workflow staging chạy thủ công riêng đã có để kiểm tra live Supabase/Redis/PostgreSQL/worker và luồng export→re-import. Blender, OpenAI và AR trên thiết bị thật vẫn cần runtime/provider/device tương ứng được cấu hình và được theo dõi rõ ràng thay vì tự động coi compilation là bằng chứng certification.

Xem thêm:

- `docs/SOURCE_CODE_GUIDE.md` — cách sử dụng và bảo trì toàn bộ source tree.
- `docs/IMPLEMENTATION_STATUS.md` — ma trận tính năng/bằng chứng.
- `docs/PHASE1_GAP_AUDIT.md` — audit Definition-of-Done theo specification.
- `docs/API.md` — bề mặt HTTP đã triển khai.
- `docs/PRODUCTION_DEPLOYMENT.md` — runbook triển khai và runtime.

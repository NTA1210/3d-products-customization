# Triển khai production

Nền tảng này gồm các process web/API/background-worker độc lập. Không triển khai toàn bộ repository như một Node process chạy dài duy nhất.

## Các managed service bắt buộc

- **Supabase Database** (`DATABASE_URL`) làm database PostgreSQL chính của ứng dụng.
- Redis tương thích BullMQ (`REDIS_URL`). Nên dùng cấu hình persistence/HA phù hợp cho background job và giữ eviction policy là `noeviction`.
- Cùng Supabase project cho Auth và private Storage, hoặc các Supabase project tách theo môi trường staging/production.
- Private Storage bucket có tên theo `SUPABASE_STORAGE_BUCKET` (mặc định `product3d`).

Prisma vẫn khai báo provider `postgresql` vì Supabase Database chính là PostgreSQL được Supabase quản lý. Ứng dụng **không** sử dụng credential MinIO/S3. Các thao tác Storage phía server dùng `SUPABASE_SECRET_KEY`; trình duyệt chỉ nhận publishable key của Supabase và signed upload/download grant có thời hạn ngắn.

Xem [SUPABASE_DATABASE.md](SUPABASE_DATABASE.md) để cấu hình `DATABASE_URL`.

## Các process runtime

Triển khai độc lập để mỗi phần có thể scale/fail mà không làm editor ngừng hoạt động:

1. `apps/web` — ứng dụng web Next.js.
2. `apps/api` — HTTP API NestJS.
3. `workers/asset-processing` — validation, analysis và normalization GLB.
4. `workers/export` — bake customized GLB, ghép variant và export dẫn xuất OBJ/STL.
5. `workers/render` — Blender catalog/multi-view/360 rendering.
6. `workers/geometry` — phân tích khả năng sản xuất bằng Trimesh.
7. `workers/ai-visualization` — tạo lifestyle image phía server.

Root workspace có thể build toàn bộ process TypeScript bằng `pnpm build`; process supervisor ở production chỉ nên start process được phân công cho service/container đó.

## Dependency native/runtime

### Asset và GLB worker
Node.js 22 là baseline của CI. Hỗ trợ Draco/Meshopt được cài từ dependency npm.

### Export worker
Cài Python 3 và:

```bash
python -m pip install -r workers/export/requirements.txt
```

Python chỉ dùng cho chuyển đổi OBJ/STL dẫn xuất. Việc bake/validate GLB vẫn dùng Node + glTF Transform.

### Geometry worker
Cài Python 3 và:

```bash
python -m pip install -r workers/geometry/requirements.txt
```

### Render worker
Cài Blender và expose binary qua `BLENDER_BIN` (mặc định `blender`). `workers/render/render.py` được chạy bằng Blender headless mode.

## Biến môi trường

Bắt đầu từ `.env.example`. Các quy tắc production quan trọng:

- `DATABASE_URL` phải trỏ vào Supabase Database và chỉ tồn tại ở server/worker.
- Backend/worker dạng process lâu dài có thể dùng direct connection nếu network hỗ trợ hoặc Supavisor Session pooler.
- Không bao giờ expose `SUPABASE_SECRET_KEY`, `DATABASE_URL` hoặc `OPENAI_API_KEY` thông qua biến `NEXT_PUBLIC_*`.
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` là key dành cho trình duyệt.
- Chỉ đặt `AI_PROVIDER=openai` trên deployment server/API nơi AI Suggest được bật.
- Đặt worker concurrency theo năng lực CPU/RAM/GPU. Blender và geometry worker thường nên bắt đầu với concurrency thấp.
- Cấu hình asset guardrail (`MAX_ASSET_BYTES`, triangle/texture/root-scale warning threshold) theo workload khách hàng thay vì hard-code giới hạn trong UI.

## Lần triển khai đầu tiên

```bash
pnpm install --frozen-lockfile
pnpm --filter @product3d/api prisma:generate
pnpm --filter @product3d/api exec prisma migrate deploy
pnpm --filter @product3d/api storage:setup
pnpm --filter @product3d/api prisma:seed
pnpm build
```

`prisma migrate deploy` áp dụng migration vào Supabase Database thông qua `DATABASE_URL`.

`storage:setup` có tính idempotent. Lệnh này tạo hoặc xác minh một Supabase Storage bucket **private** và áp dụng `MAX_ASSET_BYTES` làm giới hạn kích thước file.

Với hệ thống đã tồn tại, hãy xem `prisma:seed` là bước bảo trì dữ liệu catalog/demo thay vì tự động chạy ở mọi deployment nếu catalog production do khách hàng quản lý.

## Supabase Auth

Cấu hình Site URL / redirect URL được phép trong Supabase project cho web origin đã deploy. API xác minh Supabase bearer token; không thay thế cơ chế này bằng user ID do trình duyệt tự gửi.

## Mô hình Storage

Các đường dẫn chuẩn/private được server sinh:

- source bất biến: `assets/<assetId>/source/...`
- normalized GLB: `assets/<assetId>/normalized/model.glb`
- export: `exports/<projectId>/<jobId>/...`
- render: `renders/<projectId>/<renderJobId>/...`
- AI visualization: `ai-visualizations/<userId>/<projectId>/...`
- catalog variant: `catalog/variants/...`

Lưu object key trong Supabase Database. Sinh signed URL tại thời điểm request; không lưu signed URL hết hạn làm business state.

## Thứ tự rollout database và job

1. Áp dụng Prisma migration vào Supabase Database.
2. Deploy API code hiểu schema mới.
3. Deploy worker với queue payload contract tương ứng.
4. Deploy web cuối cùng.

Với thay đổi queue payload không tương thích ngược, hãy drain hoặc version queue trước khi thay worker. Tên queue hiện tại của Phase 1 ổn định theo từng capability.

## Kiểm tra health và smoke

Sau khi deploy:

1. `GET /api/health` trả `ok: true`.
2. Đăng nhập qua Supabase Auth.
3. Import một GLB fixture và xác nhận signed upload thành công.
4. Xác nhận asset analysis đạt `COMPLETED` và normalized artifact tồn tại.
5. Lưu manifest/project/version và kiểm tra row tương ứng trong Supabase Database.
6. Export GLB và mở lại signed artifact.
7. Chạy một render và một geometry check trên môi trường có worker tương ứng.
8. Nếu bật AI, chạy một structured AI Suggest request và xác minh action trả về được kiểm tra trước khi apply.

## Baseline observability

API cung cấp `GET /api/metrics` tương thích Prometheus; worker/API cũng phát trạng thái job và failure log. Asset analysis, render, AI request và deterministic manufacturability check phát structured event có trường duration/outcome.

Các metric hữu ích gồm:

- `asset_import_duration_seconds`
- `asset_analysis_duration_seconds`
- `render_duration_seconds`
- `export_duration_seconds`
- `ai_request_count` / failure
- số triangle trung bình của model
- `viewer_load_time_seconds`

Xem `docs/OBSERVABILITY.md` để biết chi tiết scrape và metric family.

## Checklist bảo mật

- Supabase Storage bucket luôn private.
- `DATABASE_URL`, database password và server secret key không đi vào client bundle.
- Extension/MIME/content của upload được kiểm tra bởi API + GLB validator pipeline.
- Route project/version/export/render/manufacturing/RFQ kiểm tra quyền sở hữu đã xác thực.
- Structured AI output được kiểm tra theo schema và editor action đề xuất vẫn đi qua Action/Constraint/Compatibility validation.
- Công thức dependency/manufacturing không dùng `eval` tùy ý.
- Không biến glTF extension được upload thành executable code.

## Rollback

Application service có thể rollback độc lập khi queue/database contract còn tương thích. Database rollback nên dùng corrective migration rõ ràng; không tự động đảo ngược destructive migration ở production. Source asset bất biến trong Supabase Storage không bị normalization/export job ghi đè.

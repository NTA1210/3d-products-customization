# 01 - Bắt đầu

Tài liệu này dùng để chạy source lần đầu trên máy local.

## 1. Yêu cầu môi trường

- Node.js 22.
- pnpm 9.x (`packageManager` của repo là `pnpm@9.12.3`).
- Docker nếu muốn chạy Redis local cho BullMQ.
- Một Supabase project cho **Database + Auth + private Storage**.
- Python 3 cho geometry worker và chuyển đổi OBJ/STL.
- Blender nếu muốn chạy render / 360.
- OpenAI API key chỉ khi bật AI Suggest hoặc lifestyle visualization.

## 2. Clone repository và cài dependency

```bash
git clone https://github.com/NTA1210/3d-products-customization.git
cd 3d-products-customization
pnpm install
```

Các lệnh root thường dùng:

```bash
pnpm dev
pnpm build
pnpm test
pnpm test:e2e
pnpm check
```

`pnpm dev` dùng Turbo để chạy các workspace có script `dev`.

## 3. Tạo file biến môi trường

```bash
cp .env.example .env
```

Trong Supabase Dashboard, bấm **Connect** và copy **Session pooler connection string** dùng port `5432` vào `DATABASE_URL`.

Nhóm biến tối thiểu để chạy luồng chính:

```env
DATABASE_URL=postgresql://postgres.YOUR_PROJECT_REF:YOUR_DB_PASSWORD@aws-0-YOUR_REGION.pooler.supabase.com:5432/postgres
REDIS_URL=redis://localhost:6379

SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_PUBLISHABLE_KEY=...
SUPABASE_SECRET_KEY=...
SUPABASE_STORAGE_BUCKET=product3d

NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
NEXT_PUBLIC_API_URL=http://localhost:4000
```

`DATABASE_URL` ở đây kết nối Prisma trực tiếp vào **Supabase Database**. Supabase Database là PostgreSQL được Supabase quản lý, vì vậy Prisma vẫn dùng provider `postgresql`.

Không đưa `DATABASE_URL`, database password, `SUPABASE_SECRET_KEY` hoặc `OPENAI_API_KEY` vào biến `NEXT_PUBLIC_*`.

Xem chi tiết: [Supabase Database](../SUPABASE_DATABASE.md) và [Dữ liệu, xác thực và Storage](05_DATA_AUTH_STORAGE.md).

## 4. Khởi động Redis local

Repo không còn yêu cầu PostgreSQL local. Database dùng Supabase.

```bash
docker compose up -d
```

Compose hiện chỉ chạy:

- Redis: `localhost:6379`, eviction policy `noeviction` để phù hợp BullMQ.

Kiến trúc local:

```text
Web / API / Workers local
  ├── Supabase Database
  ├── Supabase Auth
  ├── Supabase Storage
  └── Redis local
```

## 5. Chuẩn bị Prisma và Storage

```bash
pnpm --filter @product3d/api prisma:generate
pnpm --filter @product3d/api prisma:migrate
pnpm --filter @product3d/api storage:setup
pnpm --filter @product3d/api prisma:seed
```

Ý nghĩa:

- `prisma:generate`: tạo Prisma Client.
- `prisma:migrate`: áp dụng migration vào Supabase Database qua `DATABASE_URL`.
- `storage:setup`: tạo/xác minh private Supabase bucket.
- `prisma:seed`: tạo dữ liệu seed cho material/style/variant/catalog/demo cần thiết.

Sau migration, có thể mở Supabase Dashboard → **Table Editor** để kiểm tra các bảng đã được tạo.

## 6. Cài dependency Python

Geometry/manufacturability:

```bash
python -m pip install -r workers/geometry/requirements.txt
```

Export OBJ/STL dẫn xuất:

```bash
python -m pip install -r workers/export/requirements.txt
```

## 7. Chạy ứng dụng

### Cách A - chạy toàn workspace

```bash
pnpm dev
```

### Cách B - chạy từng process để debug

Web:

```bash
pnpm --filter @product3d/web dev
```

API:

```bash
pnpm --filter @product3d/api dev
```

Asset worker:

```bash
pnpm --filter @product3d/asset-processing-worker dev
```

Export worker:

```bash
pnpm --filter @product3d/export-worker dev
```

Geometry worker:

```bash
pnpm --filter @product3d/geometry-worker dev
```

Render worker:

```bash
pnpm --filter @product3d/render-worker dev
```

AI visualization worker:

```bash
pnpm --filter @product3d/ai-visualization-worker dev
```

## 8. URL local

- Web: `http://localhost:3000`
- API: `http://localhost:4000/api`
- Health: `http://localhost:4000/api/health`
- Metrics: `http://localhost:4000/api/metrics`

## 9. Luồng kiểm tra nhanh

Sau khi đăng nhập Supabase:

1. Upload `examples/fixtures/proper-components.glb`.
2. Chờ asset pipeline về trạng thái `ready`.
3. Kiểm tra Asset Preparation.
4. Chọn component có thể chỉnh sửa + các axis có thể chỉnh sửa.
5. Chọn `Save Manifest & Open Editor`.
6. Đặt vị trí / Lock.
7. Resize hoặc đổi material.
8. Undo / Redo.
9. Tạo Project.
10. Lưu Version.
11. Export GLB.

Nếu luồng này không chạy, đọc [Xử lý sự cố](10_TROUBLESHOOTING.md) trước khi sửa code.

## 10. Nên đọc tiếp

- [Supabase Database](../SUPABASE_DATABASE.md)
- [Repository và kiến trúc](02_REPOSITORY_AND_ARCHITECTURE.md)
- [Web Editor](03_WEB_EDITOR.md)
- [API Backend](04_API_BACKEND.md)
- [Worker và pipeline](06_WORKERS_AND_PIPELINES.md)

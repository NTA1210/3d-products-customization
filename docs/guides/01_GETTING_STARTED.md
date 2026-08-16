# 01 - Getting Started

Guide này dùng để chạy source lần đầu trên máy local.

## 1. Yêu cầu môi trường

- Node.js 22.
- pnpm 9.x (`packageManager` của repo là `pnpm@9.12.3`).
- Docker nếu dùng PostgreSQL + Redis local.
- Một Supabase project cho Auth + private Storage.
- Python 3 cho geometry worker và OBJ/STL conversion.
- Blender nếu muốn chạy render / 360.
- OpenAI API key chỉ khi bật AI Suggest hoặc lifestyle visualization.

## 2. Clone và cài dependency

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

## 3. Tạo environment file

```bash
cp .env.example .env
```

Nhóm biến tối thiểu để chạy core flow:

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/product3d
REDIS_URL=redis://localhost:6379

SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_PUBLISHABLE_KEY=...
SUPABASE_SECRET_KEY=...
SUPABASE_STORAGE_BUCKET=product3d

NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
NEXT_PUBLIC_API_URL=http://localhost:4000
```

Không đưa `SUPABASE_SECRET_KEY` hoặc `OPENAI_API_KEY` vào biến `NEXT_PUBLIC_*`.

Xem thêm: [Data, Auth & Storage](05_DATA_AUTH_STORAGE.md).

## 4. Start PostgreSQL + Redis local

Repo có `docker-compose.yml` cho hai dependency này:

```bash
docker compose up -d
```

Mặc định:

- PostgreSQL: `localhost:5432`, database `product3d`.
- Redis: `localhost:6379`, eviction policy `noeviction` để phù hợp BullMQ.

Supabase Auth/Storage **không** được dựng bằng compose này; dùng Supabase project riêng.

## 5. Chuẩn bị Prisma và Storage

```bash
pnpm --filter @product3d/api prisma:generate
pnpm --filter @product3d/api prisma:migrate
pnpm --filter @product3d/api storage:setup
pnpm --filter @product3d/api prisma:seed
```

Ý nghĩa:

- `prisma:generate`: generate Prisma Client.
- `prisma:migrate`: áp dụng migration local/dev.
- `storage:setup`: tạo/verify private Supabase bucket.
- `prisma:seed`: seed material/style/variant/catalog/demo data cần thiết.

## 6. Cài Python dependencies

Geometry/manufacturability:

```bash
python -m pip install -r workers/geometry/requirements.txt
```

Derived OBJ/STL export:

```bash
python -m pip install -r workers/export/requirements.txt
```

## 7. Chạy app

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

## 9. Flow kiểm tra nhanh

Sau khi đăng nhập Supabase:

1. Upload `examples/fixtures/proper-components.glb`.
2. Chờ asset pipeline về `ready`.
3. Review Asset Preparation.
4. Chọn component editable + editable axes.
5. Save Manifest & Open Editor.
6. Place / Lock.
7. Resize hoặc đổi material.
8. Undo / Redo.
9. Create Project.
10. Save Version.
11. Export GLB.

Nếu flow này không chạy, đọc [Troubleshooting](10_TROUBLESHOOTING.md) trước khi sửa code.

## 10. Nên đọc tiếp

- [Repository & Architecture](02_REPOSITORY_AND_ARCHITECTURE.md)
- [Web Editor](03_WEB_EDITOR.md)
- [API Backend](04_API_BACKEND.md)
- [Workers & Pipelines](06_WORKERS_AND_PIPELINES.md)

# Supabase Database

Project dùng **Supabase Database làm database chính**. Supabase Database là PostgreSQL được Supabase quản lý, vì vậy source vẫn dùng Prisma với provider `postgresql`; điểm khác là `DATABASE_URL` trỏ vào database của Supabase thay vì PostgreSQL chạy local.

## 1. Lấy connection string

Trong Supabase Dashboard của project:

1. Bấm **Connect** ở thanh trên cùng.
2. Chọn **Session pooler** nếu bạn chạy NestJS API và worker dạng process lâu dài trên máy local/server thông thường.
3. Copy connection string dùng port `5432`.

Dạng điển hình:

```env
DATABASE_URL=postgresql://postgres.YOUR_PROJECT_REF:YOUR_DB_PASSWORD@aws-0-YOUR_REGION.pooler.supabase.com:5432/postgres
```

Không copy nguyên placeholder ở trên. Hãy dùng chính connection string mà Dashboard của project cung cấp.

Nếu môi trường của bạn hỗ trợ IPv6 hoặc Supabase project có IPv4 add-on, direct connection cũng có thể dùng cho backend/migration:

```text
postgresql://postgres:YOUR_DB_PASSWORD@db.YOUR_PROJECT_REF.supabase.co:5432/postgres
```

## 2. Database password

Database password không phải `SUPABASE_SECRET_KEY`.

Bạn lấy/reset database password trong phần Database settings của Supabase nếu cần. Nếu password có ký tự đặc biệt như `@`, `:`, `/`, `#`, `%`, hãy URL-encode password trước khi đặt vào connection string.

## 3. Cấu hình `.env`

Ví dụ tối thiểu:

```env
DATABASE_URL=postgresql://postgres.YOUR_PROJECT_REF:YOUR_DB_PASSWORD@aws-0-YOUR_REGION.pooler.supabase.com:5432/postgres
REDIS_URL=redis://localhost:6379

SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
SUPABASE_SECRET_KEY=sb_secret_...
SUPABASE_STORAGE_BUCKET=product3d

NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

`DATABASE_URL` là server-only. Không đặt connection string hoặc database password vào biến `NEXT_PUBLIC_*`.

## 4. Khởi tạo schema bằng Prisma

Sau khi `DATABASE_URL` đã trỏ vào Supabase Database:

```bash
pnpm --filter @product3d/api prisma:generate
pnpm --filter @product3d/api prisma:migrate
pnpm --filter @product3d/api prisma:seed
```

Sau đó mở Supabase Dashboard → **Table Editor** để thấy các bảng như `User`, `ModelAsset`, `Project`, `ModelVersion`, `Job`, `RenderJob`, ...

## 5. Local development

Local không cần chạy PostgreSQL bằng Docker nữa.

```bash
docker compose up -d
```

Compose hiện chỉ chạy Redis cho BullMQ. Database, Auth và Storage đều dùng Supabase project đã cấu hình.

Kiến trúc local:

```text
Web / API / Workers trên máy local
        │
        ├── Supabase Database (Postgres)  ← Prisma / DATABASE_URL
        ├── Supabase Auth
        ├── Supabase Storage
        └── Redis local                   ← BullMQ
```

## 6. Vì sao vẫn thấy chữ PostgreSQL trong Prisma?

Trong `apps/api/prisma/schema.prisma`:

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

Đây là đúng. Supabase Database chính là PostgreSQL, nên không có provider Prisma tên `supabase`. Prisma kết nối trực tiếp vào Supabase Database thông qua PostgreSQL connection string.

## 7. Production

- Backend/worker dạng process lâu dài: ưu tiên direct connection nếu network hỗ trợ, hoặc Supavisor Session pooler.
- Serverless/auto-scaling nhiều instance: cân nhắc Transaction pooler theo hướng dẫn Supabase cho môi trường đó.
- Không commit `DATABASE_URL`, database password hoặc Supabase secret key lên Git.

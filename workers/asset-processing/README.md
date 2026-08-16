# Asset processing worker

Worker P0 dùng để kiểm tra, phân tích và normalize GLB.

Pipeline:
1. Nhận job `asset-processing` từ BullMQ/Redis.
2. Tải source GLB từ private Supabase Storage.
3. Validate glTF 2.0 bằng package Khronos `gltf-validator`.
4. Parse bằng glTF Transform, đăng ký standard extension + Draco/Meshopt dependency, sau đó chạy `prune()` và `dedup()`.
5. Serialize lại thành GLB và validate normalized bytes lần nữa.
6. Upload `assets/{assetId}/normalized/model.glb` lên Supabase Storage.
7. Lưu asset/job status, validation report và scene statistics vào Supabase Database thông qua Prisma.

Chạy local sau khi `DATABASE_URL`, Supabase Storage và Redis đã được cấu hình:

```bash
pnpm --filter @product3d/asset-processing-worker dev
```

Xem thêm:
- `docs/SUPABASE_DATABASE.md`
- `docs/SUPABASE_STORAGE.md`
- `docs/guides/06_WORKERS_AND_PIPELINES.md`

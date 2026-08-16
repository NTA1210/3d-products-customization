# 10 - Troubleshooting

Guide này gom các lỗi thường gặp khi chạy và maintain source. Mục tiêu là xác định **layer lỗi** trước khi sửa code.

## 1. Web mở được nhưng không sign in

Kiểm tra:

```env
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
```

Sau đó kiểm tra Supabase Auth Site URL / redirect URL có chứa origin local/deployed chưa.

Nếu browser có session nhưng API trả 401:

- kiểm tra `Authorization: Bearer ...` có được `authFetch` gửi không.
- kiểm tra API dùng đúng Supabase project/server config.
- không bypass `SupabaseAuthGuard` để “sửa nhanh”.

## 2. API không kết nối database

Kiểm tra:

```env
DATABASE_URL
```

Local compose mặc định:

```text
postgresql://postgres:postgres@localhost:5432/product3d
```

Sau đó chạy:

```bash
pnpm --filter @product3d/api prisma:generate
pnpm --filter @product3d/api prisma:migrate
```

Nếu schema và Prisma Client lệch nhau, generate lại trước khi debug controller.

## 3. Job không chạy / luôn QUEUED

Kiểm tra theo thứ tự:

1. `REDIS_URL` của API và worker có trỏ cùng Redis không.
2. worker capability tương ứng có đang chạy không.
3. queue name giữa API producer và worker có khớp không.
4. worker có crash vì missing native dependency không.
5. Job row có `bullmqJobId` / `failureReason` không.

Redis cho BullMQ nên dùng `noeviction`.

## 4. Upload GLB fail

Kiểm tra:

```env
SUPABASE_URL
SUPABASE_SECRET_KEY
SUPABASE_STORAGE_BUCKET
MAX_ASSET_BYTES
```

Chạy lại:

```bash
pnpm --filter @product3d/api storage:setup
```

Source upload flow gồm hai bước khác nhau:

```text
API cấp signed upload grant
→ browser upload Supabase
→ API enqueue analyze
```

Nếu analyze báo object không tồn tại, thường lỗi nằm ở bước signed upload chứ không phải glTF analyzer.

## 5. Asset processing FAILED

Kiểm tra Job `failureReason` và worker log.

Các nhóm lỗi phổ biến:

- invalid/corrupted GLB.
- unsupported/problematic extension data.
- Draco/Meshopt decode issue.
- object key/storage access.
- normalize/re-validation failure.

Dùng fixtures trong `examples/fixtures` để phân biệt lỗi môi trường với lỗi model khách hàng.

## 6. Viewer không hiện model

Kiểm tra:

1. `assetUrl` trong Zustand store.
2. signed/local URL còn hợp lệ không.
3. browser Network có tải GLB thành công không.
4. `useGLTF` có throw không.
5. WebGL/browser GPU có lỗi không.

Nếu một model khách hàng fail nhưng fixtures chạy được, ưu tiên kiểm tra GLB validation/analysis trước khi sửa Three.js.

## 7. UI thay đổi nhưng model không thay đổi

Debug chain:

```text
UI event
→ dispatch action
→ validateAction/applyActions
→ Configuration trong Zustand
→ ModelViewport projection
```

Không sửa bằng cách mutate mesh trực tiếp nếu Configuration không đổi.

## 8. Model thay đổi nhưng reload mất customization

Đây thường là dấu hiệu state chỉ tồn tại ở runtime scene.

Kiểm tra:

- Configuration có chứa thay đổi không.
- ModelConfiguration schema có serialize field đó không.
- Save Version có persist field đó không.
- hydrate/reload có đọc lại field đó không.

## 9. Dimension input bị disabled

Kiểm tra:

- placement đã Lock chưa.
- component `editable` chưa.
- `scalingMode` có cho axis scale không.
- `editableAxes` có bật axis đã map không.

Đây là domain rule, không chỉ CSS/UI state.

## 10. Material/variant không apply

Material:

- `allowedMaterialCategories` của component.
- material category trong catalog.

Variant:

- `variantGroupId`.
- component role.
- compatibility metadata.
- signed variant URL.

Nếu action fail validation, đừng bỏ compatibility check chỉ để UI hiển thị được.

## 11. Export job FAILED

Kiểm tra:

- project/version/configuration ownership.
- source GLB + Manifest có tồn tại.
- catalog material/variant referenced còn tồn tại.
- variant artifact có tải được không.
- Khronos validation của output.

OBJ/STL cần Python requirements của export worker:

```bash
python -m pip install -r workers/export/requirements.txt
```

## 12. Geometry manufacturability fail

Cài:

```bash
python -m pip install -r workers/geometry/requirements.txt
```

Test analyzer trực tiếp:

```bash
python workers/geometry/analyze.py examples/fixtures/proper-components.glb
```

Nếu command này fail thì lỗi ở Python/native layer, chưa cần debug BullMQ.

## 13. Render không chạy

Kiểm tra:

```env
BLENDER_BIN=blender
```

Xác nhận shell chạy được:

```bash
blender --version
```

Render worker cần completed GLB export. Nếu export chưa completed, sửa upstream export trước.

## 14. AI Suggest không hoạt động

Kiểm tra:

```env
AI_PROVIDER=openai
OPENAI_API_KEY
OPENAI_DESIGN_MODEL
AI_SUGGESTIONS_PER_HOUR
```

AI Suggest còn cần context/resource đúng theo API, bao gồm project/configuration và render prerequisite hiện hành.

Nếu provider trả output nhưng UI không apply, kiểm tra structured schema/catalog/constraint validation — không bypass validator.

## 15. `/api/metrics` trả 401

Nếu có:

```env
METRICS_BEARER_TOKEN=...
```

request cần:

```http
Authorization: Bearer <token>
```

`POST /api/metrics/client` là endpoint khác và dùng Supabase user authentication.

## 16. Vitest chạy nhầm Playwright test

Repo đã cấu hình tách Vitest và Playwright. Nếu thêm file test mới:

- domain/integration dùng naming/config của Vitest.
- browser test đặt dưới `tests/e2e`.
- live staging test đặt dưới `tests/staging`.

Không import `@playwright/test` vào file Vitest.

## 17. CI build fail

Xác định step:

```text
Prisma generate → schema/client
Python syntax/runtime → native worker
pnpm test → domain regression
Build → TS/Nest/Next
Playwright → browser flow
```

Nếu workflow upload artifact, đọc `build-log` hoặc `playwright-report` trước khi đoán lỗi.

## 18. Khi nào dùng fixture

Luôn thử lại bằng fixture tương ứng:

- `proper-components.glb`
- `disconnected-islands.glb`
- `continuous-mesh.glb`
- `multi-material.glb`

Nếu fixture pass nhưng customer asset fail, khả năng cao là model-specific quality/compatibility issue.

## 19. Tài liệu liên quan

- [01 - Getting Started](01_GETTING_STARTED.md)
- [06 - Workers & Pipelines](06_WORKERS_AND_PIPELINES.md)
- [08 - Testing & CI](08_TESTING_AND_CI.md)
- [../PRODUCTION_DEPLOYMENT.md](../PRODUCTION_DEPLOYMENT.md)

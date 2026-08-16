# 10 - Xử lý sự cố

Tài liệu này tổng hợp các lỗi thường gặp khi chạy và bảo trì source. Mục tiêu là xác định **layer bị lỗi** trước khi sửa code.

## 1. Web mở được nhưng không đăng nhập được

Kiểm tra:

```env
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
```

Sau đó kiểm tra Supabase Auth Site URL / redirect URL đã chứa origin local/deployed chưa.

Nếu trình duyệt có session nhưng API trả 401:

- kiểm tra `Authorization: Bearer ...` có được `authFetch` gửi không.
- kiểm tra API dùng đúng Supabase project/server config.
- không bỏ qua `SupabaseAuthGuard` chỉ để “sửa nhanh”.

## 2. API không kết nối được database

Database chính là Supabase Database. Kiểm tra:

```env
DATABASE_URL
```

Với local/persistent API + worker, `DATABASE_URL` nên là **Session pooler** connection string port `5432` lấy từ Supabase Dashboard → **Connect**.

Dạng ví dụ:

```text
postgresql://postgres.PROJECT_REF:PASSWORD@aws-0-REGION.pooler.supabase.com:5432/postgres
```

Sau đó chạy:

```bash
pnpm --filter @product3d/api prisma:generate
pnpm --filter @product3d/api prisma:migrate
```

Nếu schema và Prisma Client lệch nhau, hãy generate lại trước khi debug controller. Xem thêm [Supabase Database](../SUPABASE_DATABASE.md).

## 3. Job không chạy / luôn ở QUEUED

Kiểm tra theo thứ tự:

1. `REDIS_URL` của API và worker có trỏ cùng Redis không.
2. worker capability tương ứng có đang chạy không.
3. queue name giữa API producer và worker có khớp không.
4. worker có crash vì thiếu native dependency không.
5. Job row có `bullmqJobId` / `failureReason` không.

Redis cho BullMQ nên dùng `noeviction`.

## 4. Upload GLB thất bại

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

Luồng upload source gồm các bước riêng:

```text
API cấp signed upload grant
→ trình duyệt upload lên Supabase
→ API enqueue analyze
```

Nếu analyze báo object không tồn tại, lỗi thường nằm ở bước signed upload chứ không phải glTF analyzer.

## 5. Phân biệt lỗi GLB với model note

Nếu footer hiển thị:

```text
Asset: ready
```

thì asset pipeline đã validate/analyze/normalize thành công. Những thông tin `INFO` như:

- root node có authored scale khác `1`;
- display name trùng giữa các source object;
- một mesh chứa nhiều disconnected geometry island;

là **model note**, không đồng nghĩa upload thất bại.

Asset Preparation hiện chỉ đưa `WARNING`/`ERROR` lên khu vực cảnh báo chính. Các `INFO` được gom thành non-blocking note count.

`UNKNOWN · fixed` cũng là trạng thái mặc định an toàn, không phải lỗi. Hệ thống không tự đoán semantic role hoặc cho phép edit component nếu người dùng chưa xác nhận trong Asset Preparation.

Với asset có nhiều source mesh rõ ràng, geometry island không cần map thủ công. Region mapping chỉ hiển thị cho trường hợp **single-mesh asset** cần chuẩn bị vùng hình học.

## 6. Asset processing chuyển sang FAILED

Kiểm tra `failureReason` của Job và log worker.

Các nhóm lỗi phổ biến:

- GLB không hợp lệ/bị hỏng.
- dữ liệu extension không được hỗ trợ hoặc có vấn đề.
- lỗi decode Draco/Meshopt.
- object key/quyền truy cập storage.
- lỗi normalize hoặc re-validation.

Dùng fixture trong `examples/fixtures` để phân biệt lỗi môi trường với lỗi model khách hàng.

## 7. Viewer không hiển thị model

Kiểm tra:

1. `assetUrl` trong Zustand store.
2. signed/local URL còn hợp lệ không.
3. tab Network của trình duyệt có tải GLB thành công không.
4. `useGLTF` có throw lỗi không.
5. WebGL/GPU của trình duyệt có lỗi không.

Nếu một model khách hàng lỗi nhưng fixture chạy được, ưu tiên kiểm tra GLB validation/analysis trước khi sửa Three.js.

## 8. UI thay đổi nhưng model không thay đổi

Chuỗi debug:

```text
UI event
→ dispatch action
→ validateAction/applyActions
→ Configuration trong Zustand
→ ModelViewport projection
```

Không sửa bằng cách mutate mesh trực tiếp nếu Configuration không thay đổi.

## 9. Model thay đổi nhưng reload làm mất customization

Đây thường là dấu hiệu state chỉ tồn tại ở runtime scene.

Kiểm tra:

- Configuration có chứa thay đổi không.
- ModelConfiguration schema có serialize field đó không.
- Save Version có lưu field đó không.
- hydrate/reload có đọc lại field đó không.

## 10. Dimension input bị disabled

Kiểm tra:

- placement đã Lock chưa.
- component đã `editable` chưa.
- `scalingMode` có cho scale theo axis đó không.
- `editableAxes` có bật axis đã map không.

Đây là domain rule, không chỉ là CSS/UI state.

## 11. Material/variant không áp dụng được

Material:

- `allowedMaterialCategories` của component.
- material category trong catalog.

Variant:

- `variantGroupId`.
- component role.
- compatibility metadata.
- signed variant URL.

Nếu action thất bại validation, đừng bỏ compatibility check chỉ để UI hiển thị được.

## 12. Export job chuyển sang FAILED

Kiểm tra:

- quyền sở hữu project/version/configuration.
- source GLB + Manifest có tồn tại không.
- catalog material/variant được tham chiếu còn tồn tại không.
- variant artifact có tải được không.
- Khronos validation của output.

OBJ/STL cần Python requirement của export worker:

```bash
python -m pip install -r workers/export/requirements.txt
```

## 13. Geometry manufacturability bị lỗi

Cài:

```bash
python -m pip install -r workers/geometry/requirements.txt
```

Test analyzer trực tiếp:

```bash
python workers/geometry/analyze.py examples/fixtures/proper-components.glb
```

Nếu command này lỗi thì vấn đề nằm ở layer Python/native, chưa cần debug BullMQ.

## 14. Render không chạy

Kiểm tra:

```env
BLENDER_BIN=blender
```

Xác nhận shell chạy được:

```bash
blender --version
```

Render worker cần completed GLB export. Nếu export chưa completed, sửa upstream export trước.

## 15. AI Suggest không hoạt động

Kiểm tra:

```env
AI_PROVIDER=openai
OPENAI_API_KEY
OPENAI_DESIGN_MODEL
AI_SUGGESTIONS_PER_HOUR
```

AI Suggest còn cần context/resource đúng theo API, bao gồm project/configuration và render prerequisite hiện hành.

Nếu provider trả output nhưng UI không áp dụng, kiểm tra structured schema/catalog/constraint validation — không bỏ qua validator.

## 16. `/api/metrics` trả 401

Nếu có:

```env
METRICS_BEARER_TOKEN=...
```

request cần:

```http
Authorization: Bearer <token>
```

`POST /api/metrics/client` là endpoint khác và dùng Supabase user authentication.

## 17. Vitest chạy nhầm Playwright test

Repo đã cấu hình tách Vitest và Playwright. Nếu thêm file test mới:

- domain/integration dùng naming/config của Vitest.
- browser test đặt dưới `tests/e2e`.
- live staging test đặt dưới `tests/staging`.

Không import `@playwright/test` vào file Vitest.

## 18. CI build thất bại

Xác định step:

```text
Prisma generate → schema/client
Python syntax/runtime → native worker
pnpm test → domain regression
Build → TS/Nest/Next
Playwright → browser flow
```

Nếu workflow upload artifact, đọc `build-log` hoặc `playwright-report` trước khi đoán lỗi.

## 19. Khi nào dùng fixture

Luôn thử lại bằng fixture tương ứng:

- `proper-components.glb`
- `disconnected-islands.glb`
- `continuous-mesh.glb`
- `multi-material.glb`

Nếu fixture pass nhưng customer asset fail, khả năng cao là vấn đề chất lượng/compatibility riêng của model.

## 20. Tài liệu liên quan

- [01 - Bắt đầu](01_GETTING_STARTED.md)
- [../SUPABASE_DATABASE.md](../SUPABASE_DATABASE.md)
- [06 - Worker và pipeline](06_WORKERS_AND_PIPELINES.md)
- [08 - Kiểm thử và CI](08_TESTING_AND_CI.md)
- [../PRODUCTION_DEPLOYMENT.md](../PRODUCTION_DEPLOYMENT.md)

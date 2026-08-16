# 11 - Extension Guide

Guide này dùng khi cần thêm feature mới mà vẫn giữ đúng kiến trúc của repo.

## 1. Bắt đầu từ domain, không bắt đầu từ UI

Trước khi viết button/input mới, trả lời:

1. Feature thay đổi business state nào?
2. State đó thuộc Manifest, Configuration, ModelVersion hay artifact riêng?
3. Có cần EditorAction mới không?
4. Có constraint/compatibility/dependency mới không?
5. Có cần worker không?
6. Output là state, artifact hay suggestion?

## 2. Thêm một EditorAction mới

Ví dụ muốn thêm action mới `SET_SOMETHING`.

### Bước 1 - Action schema

Sửa:

```text
packages/action-engine/
```

Thêm action vào Zod union/schema và type export.

### Bước 2 - Domain state

Nếu action cần field state mới, sửa schema tương ứng trong:

```text
packages/model-schema/
```

Đảm bảo field serialize được trong Configuration/ModelVersion.

### Bước 3 - Validation

Nếu có rule:

```text
packages/constraint-engine/
packages/compatibility-engine/
```

Không đặt validation chỉ trong React component.

### Bước 4 - Apply logic

Sửa:

```text
packages/editor-core/
```

`applyAction/applyActions` phải tạo Configuration mới và giữ transaction semantics.

### Bước 5 - Runtime projection

Nếu action tạo visual effect, thêm projection trong:

```text
apps/web/components/ModelViewport.tsx
```

Scene chỉ đọc state mới để render.

### Bước 6 - UI

Cuối cùng mới thêm control trong `EditorShell` hoặc feature component phù hợp.

### Bước 7 - Test

Thêm tối thiểu:

- action schema test.
- validation test.
- apply test.
- serialization test nếu state mới.
- Undo/Redo test.
- Playwright nếu nằm trên critical user flow.

## 3. Thêm field vào Manifest

Manifest là model/component rule definition, không phải temporary UI state.

Checklist:

1. sửa `ModelManifest`/component schema.
2. update Asset Preparation UI.
3. update save/load manifest API nếu cần.
4. update domain engine dùng field đó.
5. migration chỉ cần nếu field nằm trong typed DB column; `manifestJson` bản thân là JSON nhưng schema versioning vẫn cần cân nhắc backward compatibility.
6. thêm fixture/test cho field mới.

## 4. Thêm field vào Configuration

Configuration phải:

- serializable.
- deterministic.
- đủ để reload exact state.

Sau khi thêm field:

1. update schema/default state.
2. update editor apply logic.
3. update viewer projection.
4. update export baking nếu field ảnh hưởng artifact.
5. update save/reload/version tests.

Nếu export không biết field mới nhưng viewer biết, rất dễ tạo tình trạng “trên màn hình đúng, file export sai”.

## 5. Thêm API capability mới

Pattern:

```text
apps/api/src/<capability>/
```

Checklist:

1. request Zod validation.
2. `SupabaseAuthGuard` nếu user-owned.
3. ownership check server-side.
4. reuse domain schema/engine.
5. nếu operation dài: Job + queue.
6. private artifact: object key + signed read URL.
7. register controller/service trong AppModule.
8. update `docs/API.md`.
9. test.

## 6. Thêm worker mới

Tạo:

```text
workers/<capability>/
```

Nên có:

```text
package.json
src/index.ts
tsconfig.json
README.md
requirements.txt   # nếu có Python
```

Sau đó:

1. tạo queue producer trong API.
2. định nghĩa queue payload type.
3. create/update Job record.
4. worker update lifecycle.
5. write artifact private.
6. add deployment dependency.
7. add CI smoke nếu runtime chạy được trên GitHub runner.
8. add metrics/troubleshooting.

## 7. Thêm material/variant/style catalog field

Catalog metadata có thể được dùng bởi:

- compatibility engine.
- preset/style engine.
- AI prompt/catalog validation.
- export worker.
- collection recommendation.

Vì vậy khi sửa catalog schema, search toàn repo theo field cũ/new field trước khi merge.

## 8. Thêm AI capability

AI output không được coi là trusted business state.

Flow bắt buộc:

```text
provider response
→ Zod schema
→ known resource ID validation
→ domain constraint/compatibility validation
→ user apply hoặc derivative artifact
```

Nếu AI đề xuất editor changes, output cuối nên là EditorAction/batch action.

Nếu AI tạo image, lưu artifact riêng; không mutate GLB canonical.

## 9. Thêm manufacturing rule

Ưu tiên deterministic rule trong:

```text
packages/manufacturing-engine/
```

Nếu cần geometry facts thực, dùng geometry worker output từ customized GLB.

Nếu rule gợi ý cách sửa, trả suggested EditorAction hợp lệ thay vì một chuỗi hướng dẫn khó apply tự động.

## 10. Thêm export format

Không tạo một pipeline customization song song cho format mới.

Pattern đúng:

```text
source + configuration
→ customized GLB canonical
→ validate
→ derive format mới
```

Như vậy format mới kế thừa cùng customization truth.

Cân nhắc unit semantics: GLB/glTF dùng meter; OBJ/STL hiện được derive ở millimeter coordinates.

## 11. Thêm metrics

Nếu metric có thể suy ra từ persisted DB state, ưu tiên derive từ DB để không phụ thuộc memory của một API instance.

Nếu là browser-only metric, gửi qua authenticated telemetry endpoint.

Update:

```text
docs/OBSERVABILITY.md
tests/metrics.test.ts
```

## 12. Pull Request checklist

Trước PR:

```bash
pnpm test
pnpm check
pnpm build
```

Nếu sửa browser flow:

```bash
pnpm test:e2e
```

Nếu sửa geometry worker:

```bash
python tests/geometry_worker_smoke.py
```

PR description nên nêu:

- state/source-of-truth nào thay đổi.
- validation boundary.
- worker/artifact impact.
- migration/queue compatibility.
- tests đã thêm/chạy.
- phần nào vẫn cần staging/provider/device proof.

## 13. Anti-patterns cần tránh

- Mutate `THREE.Mesh` rồi coi đó là saved state.
- Hard-code component bằng mesh name cho một model cụ thể.
- Lưu signed URL vào DB như canonical artifact identity.
- Cho browser giữ service secret.
- Gọi Blender/Trimesh/OpenAI tác vụ dài trực tiếp trong request handler.
- Cho AI bypass schema/catalog/constraint validation.
- Tạo export logic riêng không đi từ canonical configuration.
- Tắt test/CI để merge feature.

## 14. Đọc thêm

- [02 - Repository & Architecture](02_REPOSITORY_AND_ARCHITECTURE.md)
- [03 - Web Editor](03_WEB_EDITOR.md)
- [04 - API Backend](04_API_BACKEND.md)
- [06 - Workers & Pipelines](06_WORKERS_AND_PIPELINES.md)
- [08 - Testing & CI](08_TESTING_AND_CI.md)

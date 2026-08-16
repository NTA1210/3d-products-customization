# 11 - Hướng dẫn mở rộng

Tài liệu này dùng khi cần thêm feature mới mà vẫn giữ đúng kiến trúc của repo.

## 1. Bắt đầu từ domain, không bắt đầu từ UI

Trước khi viết button/input mới, hãy trả lời:

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

Đảm bảo field có thể serialize trong Configuration/ModelVersion.

### Bước 3 - Validation

Nếu có rule:

```text
packages/constraint-engine/
packages/compatibility-engine/
```

Không đặt validation chỉ trong React component.

### Bước 4 - Logic áp dụng

Sửa:

```text
packages/editor-core/
```

`applyAction/applyActions` phải tạo Configuration mới và giữ đúng semantics của transaction.

### Bước 5 - Projection ở runtime

Nếu action tạo hiệu ứng hiển thị, thêm projection trong:

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
- serialization test nếu có state mới.
- Undo/Redo test.
- Playwright nếu nằm trên critical user flow.

## 3. Thêm field vào Manifest

Manifest là định nghĩa rule của model/component, không phải temporary UI state.

Checklist:

1. sửa `ModelManifest`/component schema.
2. cập nhật Asset Preparation UI.
3. cập nhật save/load manifest API nếu cần.
4. cập nhật domain engine dùng field đó.
5. migration chỉ cần nếu field nằm trong typed DB column; `manifestJson` bản thân là JSON nhưng schema versioning vẫn cần cân nhắc backward compatibility.
6. thêm fixture/test cho field mới.

## 4. Thêm field vào Configuration

Configuration phải:

- có thể serialize.
- có tính xác định.
- đủ để reload lại chính xác state.

Sau khi thêm field:

1. cập nhật schema/default state.
2. cập nhật editor apply logic.
3. cập nhật viewer projection.
4. cập nhật export baking nếu field ảnh hưởng artifact.
5. cập nhật test save/reload/version.

Nếu export không biết field mới nhưng viewer biết, rất dễ tạo tình trạng “trên màn hình đúng, file export sai”.

## 5. Thêm capability API mới

Mẫu cấu trúc:

```text
apps/api/src/<capability>/
```

Checklist:

1. kiểm tra request bằng Zod.
2. dùng `SupabaseAuthGuard` nếu tài nguyên thuộc người dùng.
3. kiểm tra ownership phía server.
4. tái sử dụng domain schema/engine.
5. nếu tác vụ dài: Job + queue.
6. private artifact: object key + signed read URL.
7. đăng ký controller/service trong AppModule.
8. cập nhật `docs/API.md`.
9. thêm test.

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
3. tạo/cập nhật Job record.
4. worker cập nhật vòng đời.
5. ghi artifact private.
6. bổ sung dependency deployment.
7. thêm CI smoke nếu runtime có thể chạy trên GitHub runner.
8. bổ sung metric/troubleshooting.

## 7. Thêm field cho catalog material/variant/style

Catalog metadata có thể được sử dụng bởi:

- compatibility engine.
- preset/style engine.
- AI prompt/catalog validation.
- export worker.
- collection recommendation.

Vì vậy khi sửa catalog schema, hãy search toàn repo theo field cũ/field mới trước khi merge.

## 8. Thêm capability AI

AI output không được coi là business state đáng tin cậy.

Luồng bắt buộc:

```text
provider response
→ Zod schema
→ known resource ID validation
→ domain constraint/compatibility validation
→ user apply hoặc derivative artifact
```

Nếu AI đề xuất thay đổi editor, output cuối nên là EditorAction/batch action.

Nếu AI tạo image, lưu artifact riêng; không mutate canonical GLB.

## 9. Thêm manufacturing rule

Ưu tiên deterministic rule trong:

```text
packages/manufacturing-engine/
```

Nếu cần geometry fact thực, dùng output của geometry worker từ customized GLB.

Nếu rule gợi ý cách sửa, trả EditorAction gợi ý hợp lệ thay vì một chuỗi hướng dẫn khó áp dụng tự động.

## 10. Thêm định dạng export

Không tạo một pipeline customization song song cho định dạng mới.

Mẫu đúng:

```text
source + configuration
→ customized GLB canonical
→ validate
→ derive format mới
```

Như vậy định dạng mới kế thừa cùng nguồn sự thật customization.

Cần cân nhắc semantics về unit: GLB/glTF dùng meter; OBJ/STL hiện được tạo theo tọa độ millimeter.

## 11. Thêm metric

Nếu metric có thể suy ra từ persisted DB state, ưu tiên lấy từ DB để không phụ thuộc memory của một API instance.

Nếu là metric chỉ có ở trình duyệt, gửi qua authenticated telemetry endpoint.

Cập nhật:

```text
docs/OBSERVABILITY.md
tests/metrics.test.ts
```

## 12. Checklist Pull Request

Trước PR:

```bash
pnpm test
pnpm check
pnpm build
```

Nếu sửa luồng trình duyệt:

```bash
pnpm test:e2e
```

Nếu sửa geometry worker:

```bash
python tests/geometry_worker_smoke.py
```

Mô tả PR nên nêu:

- state/source-of-truth nào thay đổi.
- validation boundary.
- tác động tới worker/artifact.
- compatibility của migration/queue.
- test đã thêm/chạy.
- phần nào vẫn cần bằng chứng từ staging/provider/device.

## 13. Các anti-pattern cần tránh

- Mutate `THREE.Mesh` rồi coi đó là saved state.
- Hard-code component bằng mesh name cho một model cụ thể.
- Lưu signed URL vào DB như canonical artifact identity.
- Cho trình duyệt giữ service secret.
- Gọi Blender/Trimesh/OpenAI cho tác vụ dài trực tiếp trong request handler.
- Cho AI bỏ qua schema/catalog/constraint validation.
- Tạo export logic riêng không đi từ canonical configuration.
- Tắt test/CI chỉ để merge feature.

## 14. Đọc thêm

- [02 - Repository và kiến trúc](02_REPOSITORY_AND_ARCHITECTURE.md)
- [03 - Web Editor](03_WEB_EDITOR.md)
- [04 - API Backend](04_API_BACKEND.md)
- [06 - Worker và pipeline](06_WORKERS_AND_PIPELINES.md)
- [08 - Kiểm thử và CI](08_TESTING_AND_CI.md)

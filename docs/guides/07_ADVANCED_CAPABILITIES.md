# 07 - Các khả năng nâng cao

Tài liệu này giải thích cách các capability ngoài editor core sử dụng project/version/export hiện tại.

## 1. Nguyên tắc chung

Các capability nâng cao **không tạo một đường business state riêng**. Chúng phải dựa trên:

```text
Asset + Manifest + Configuration / ModelVersion
```

và khi cần geometry/render thì dùng customized export hiện tại.

## 2. Component Variant

Variant thay thế component bằng asset trong catalog tương thích.

Các điều kiện compatibility có thể gồm:

- variant group.
- semantic role.
- metadata model/component.
- dimension policy.

`AUTO_FIT` dùng kích thước target component để scale variant trong runtime/export composition.

UI liên quan:

```text
apps/web/components/StyleVariantTools.tsx
```

Domain liên quan:

```text
packages/compatibility-engine/
packages/model-schema/
```

Xem thêm: [../VARIANTS_PRESETS.md](../VARIANTS_PRESETS.md).

## 3. Style và Preset

Style/preset không mutate Configuration tùy ý. Engine phải chuyển rule thành một **batch EditorAction** và chạy cùng validation/apply pipeline như thao tác thủ công.

Domain:

```text
packages/preset-engine/
```

Khi tạo preset mới, chỉ lưu rule/state cần thiết; tránh lưu runtime object Three.js.

## 4. AI Design Suggest

AI Suggest là hệ thống đề xuất có cấu trúc, không phải canonical 3D generator.

Luồng:

```text
current project/configuration
+ Manifest
+ catalog IDs
+ constraints
+ completed MULTI_VIEW render
→ API/provider
→ structured response
→ schema/catalog validation
→ constraint/compatibility validation
→ user chọn Apply
→ normal editor dispatchBatch
```

AI không được:

- tự tạo component/material/variant ID ngoài catalog rồi áp dụng trực tiếp.
- mutate Three.js scene.
- thay thế source GLB chuẩn.
- giữ API key ở trình duyệt.

Ví dụ cấu hình server:

```env
AI_PROVIDER=openai
OPENAI_API_KEY=...
OPENAI_DESIGN_MODEL=...
AI_SUGGESTIONS_PER_HOUR=...
```

Xem thêm: [../OPENAI_PROVIDER.md](../OPENAI_PROVIDER.md).

## 5. AI Lifestyle Visualization

Visualization dùng render của sản phẩm hiện tại làm reference rồi tạo PNG dẫn xuất.

Luồng:

```text
render artifact
→ AI visualization BullMQ job
→ provider
→ PNG
→ private Supabase Storage
```

Artifact này chỉ phục vụ preview/presentation; nó không sửa trạng thái 3D.

## 6. Khả năng sản xuất

Có hai layer:

### Quy tắc xác định

`packages/manufacturing-engine` kiểm tra:

- constraint trong manifest.
- dimension.
- material.
- manufacturing rule đã cấu hình.

Rule có thể trả EditorAction gợi ý để người dùng sửa vấn đề qua action pipeline thông thường.

### Phân tích geometry

`workers/geometry/analyze.py` dùng Trimesh trên **customized exported GLB**.

Các dữ kiện hiện có gồm body count, watertight, bounds/extents, volume khi hợp lệ.

Không chạy geometry check trên immutable source nếu mục tiêu là đánh giá sản phẩm sau customization.

## 7. Render / 360

Render worker dùng Blender headless.

Luồng:

```text
completed customized GLB export
→ POST /render-jobs
→ BullMQ
→ Blender
→ PNG frame(s)
→ Supabase
```

Các mode:

- `MULTI_VIEW`
- `SPIN_360`

Render resource phải thuộc cùng authenticated project/user.

## 8. AR Preview

AR preview sử dụng current-configuration export và lớp `<model-viewer>` trên web.

Web component:

```text
apps/web/components/ModelViewerPreview.tsx
```

AR không nên load source GLB cũ nếu người dùng đã customize; dùng artifact của configuration hiện tại.

Khả năng hỗ trợ theo device/browser là vấn đề runtime; xem gap audit trước khi coi AR đã được chứng nhận trên mọi thiết bị.

## 9. Đề xuất Collection

Domain:

```text
packages/collection-engine/
```

V1 là cách xếp hạng có tính xác định, không cần AI provider.

Trọng số hiện tại:

```text
style     50%
material  25%
color     15%
other     10%
```

API trả score + breakdown để có thể giải thích recommendation.

## 10. Workshop / RFQ / Quote

RFQ phải tham chiếu một **saved ModelVersion** thật.

Payload có thể gồm:

- dimension/component/material.
- manufacturability issue.
- preview/render reference.
- export reference.
- ghi chú khách hàng/workshop.

Canonical payload lưu resource ID/object key. Khi đọc, API tạo signed URL mới.

Vòng đời Phase 1:

```text
SUBMITTED → RECEIVED → ACCEPTED | REJECTED
                       ↘ EXPIRED khi quá hạn theo rule
```

UI:

```text
apps/web/components/CollectionWorkshopTools.tsx
```

## 11. Khi sửa một capability nâng cao

Trước khi code, xác định:

1. nguồn input chuẩn là Configuration hay saved ModelVersion?
2. có cần customized GLB export trước không?
3. thao tác có đủ nặng để cần BullMQ không?
4. artifact có private không?
5. quyền sở hữu user/project được kiểm tra ở đâu?
6. output có phải EditorAction không?
7. cần domain test, worker smoke hay browser E2E?

## 12. Tài liệu liên quan

- [../AI_MANUFACTURING_SCOPE.md](../AI_MANUFACTURING_SCOPE.md)
- [../EXPORT.md](../EXPORT.md)
- [../VARIANTS_PRESETS.md](../VARIANTS_PRESETS.md)
- [../API.md](../API.md)
- [06 - Worker và pipeline](06_WORKERS_AND_PIPELINES.md)

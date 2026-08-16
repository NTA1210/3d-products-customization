# 07 - Advanced Capabilities

Guide này giải thích cách các capability ngoài editor core sử dụng project/version/export hiện tại.

## 1. Nguyên tắc chung

Các capability nâng cao **không tạo một business-state path riêng**. Chúng phải dựa trên:

```text
Asset + Manifest + Configuration / ModelVersion
```

và khi cần geometry/render thì dùng customized export hiện tại.

## 2. Component Variants

Variant thay thế component bằng catalog asset tương thích.

Các điều kiện compatibility có thể gồm:

- variant group.
- semantic role.
- model/component metadata.
- dimension policy.

`AUTO_FIT` dùng target component dimensions để scale variant runtime/export composition.

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

## 3. Style & Preset

Style/preset không mutate Configuration tùy ý. Engine phải convert rule thành một **batch EditorAction** và chạy cùng validation/apply pipeline như thao tác manual.

Domain:

```text
packages/preset-engine/
```

Khi tạo preset mới, chỉ persist rule/state cần thiết; tránh lưu runtime Three.js object.

## 4. AI Design Suggest

AI Suggest là structured suggestion system, không phải canonical 3D generator.

Flow:

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

- invent component/material/variant ID ngoài catalog rồi apply trực tiếp.
- mutate Three.js scene.
- thay thế source GLB canonical.
- giữ API key ở browser.

Server config ví dụ:

```env
AI_PROVIDER=openai
OPENAI_API_KEY=...
OPENAI_DESIGN_MODEL=...
AI_SUGGESTIONS_PER_HOUR=...
```

Xem thêm: [../OPENAI_PROVIDER.md](../OPENAI_PROVIDER.md).

## 5. AI Lifestyle Visualization

Visualization dùng render của current product làm reference rồi tạo PNG derivative.

Flow:

```text
render artifact
→ AI visualization BullMQ job
→ provider
→ PNG
→ private Supabase Storage
```

Artifact này chỉ phục vụ preview/presentation; nó không sửa 3D state.

## 6. Manufacturability

Có hai layer:

### Deterministic rules

`packages/manufacturing-engine` kiểm tra:

- manifest constraints.
- dimensions.
- materials.
- configured manufacturing rules.

Rule có thể trả suggested EditorAction để user sửa vấn đề qua normal action pipeline.

### Geometry analysis

`workers/geometry/analyze.py` dùng Trimesh trên **customized exported GLB**.

Các facts hiện có gồm body count, watertight, bounds/extents, volume khi hợp lệ.

Không chạy geometry check trên immutable source nếu mục tiêu là đánh giá sản phẩm sau customization.

## 7. Render / 360

Render worker dùng Blender headless.

Flow:

```text
completed customized GLB export
→ POST /render-jobs
→ BullMQ
→ Blender
→ PNG frame(s)
→ Supabase
```

Modes:

- `MULTI_VIEW`
- `SPIN_360`

Render resource phải thuộc cùng authenticated project/user.

## 8. AR Preview

AR preview sử dụng current-configuration export và `<model-viewer>` layer ở web.

Web component:

```text
apps/web/components/ModelViewerPreview.tsx
```

AR không nên load source GLB cũ nếu người dùng đã customize; dùng artifact của current configuration.

Device/browser support là runtime concern, xem gap audit trước khi coi AR là certified trên mọi thiết bị.

## 9. Collection Recommendation

Domain:

```text
packages/collection-engine/
```

V1 là deterministic ranking, không cần AI provider.

Weights hiện tại:

```text
style     50%
material  25%
color     15%
other     10%
```

API trả score + breakdown để có thể giải thích recommendation.

## 10. Workshop / RFQ / Quote

RFQ phải reference một **saved ModelVersion** thật.

Payload có thể gồm:

- dimensions/components/materials.
- manufacturability issues.
- preview/render references.
- export reference.
- customer note/workshop.

Canonical payload lưu resource ID/object key. Khi đọc, API mint signed URL mới.

Lifecycle Phase 1:

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

1. input source of truth là Configuration hay saved ModelVersion?
2. có cần customized GLB export trước không?
3. operation có đủ nặng để cần BullMQ không?
4. artifact có private không?
5. user/project ownership được check ở đâu?
6. output có phải EditorAction không?
7. cần domain test, worker smoke hay browser E2E?

## 12. Tài liệu liên quan

- [../AI_MANUFACTURING_SCOPE.md](../AI_MANUFACTURING_SCOPE.md)
- [../EXPORT.md](../EXPORT.md)
- [../VARIANTS_PRESETS.md](../VARIANTS_PRESETS.md)
- [../API.md](../API.md)
- [06 - Workers & Pipelines](06_WORKERS_AND_PIPELINES.md)

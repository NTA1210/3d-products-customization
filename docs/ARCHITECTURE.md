# Kiến trúc hệ thống

## Nguồn dữ liệu chuẩn

- **Original GLB** — asset khách hàng bất biến trong Supabase Storage riêng tư.
- **Normalized GLB** — bản dẫn xuất đã được kiểm tra/normalize; không bao giờ ghi đè source.
- **Manifest** — định nghĩa component/rule ổn định được tạo từ Asset Preparation.
- **Configuration** — trạng thái tùy chỉnh hiện tại có thể serialize.
- **ModelVersion** — snapshot configuration được lưu, không phải bản sao của source GLB.
- **Runtime Three.js scene** — chỉ là projection của asset + manifest + configuration.
- **Export artifact** — output được sinh từ source bất biến + configuration hiện tại/đã lưu.
- **Render/AI artifact** — các bản dẫn xuất private riêng, được tham chiếu bằng object key.

Signed URL hết hạn là thông tin xác thực vận chuyển dữ liệu, không phải business state. PostgreSQL lưu object key/resource ID; API tạo signed URL có thời hạn ngắn khi client cần artifact.

## Pipeline thay đổi trạng thái

```text
Manual / Preset / Style / AI
  → Structured EditorAction
  → Schema Validation
  → Constraint Validation
  → Compatibility Validation
  → Dependency Resolution
  → Apply Command / Transaction
  → Serializable Configuration
  → Runtime Projection
  → History / ModelVersion
```

Điều khiển thủ công, rule style/preset và đề xuất AI đã được kiểm tra đều sử dụng cùng action shape và editor core. AI không thay đổi trực tiếp Three.js scene và không sinh canonical 3D model.

## Luồng asset

```text
Supabase Auth
  → POST /assets/import
  → signed private Supabase upload grant
  → browser uploads source GLB
  → BullMQ asset-processing job
  → Khronos validation
  → source-index scene analysis
  → disconnected geometry-island candidates
  → model-quality warnings
  → glTF Transform normalization
  → Khronos re-validation
  → normalized private GLB + persisted analysis
  → Asset Preparation
  → saved Manifest
  → Place
  → Lock
  → Customize
```

Stable component candidate sử dụng source index của glTF node/mesh/primitive, không dùng mesh name làm business ID duy nhất. Các region theo connectivity chỉ là **geometry candidate** và vẫn chưa được xác nhận semantic cho đến bước Asset Preparation.

## Storage và danh tính

Supabase được sử dụng cho:

- Danh tính/session token qua Auth.
- Source/normalized/export/render/AI/variant artifact private trên Storage.
- Signed upload/download grant.

Trình duyệt chỉ nhận publishable key và signed grant tạm thời. `SUPABASE_SECRET_KEY` chỉ tồn tại ở API/worker.

Storage object key dùng các namespace theo capability như:

- `assets/<assetId>/source/...`
- `assets/<assetId>/normalized/model.glb`
- `catalog/variants/...`
- `exports/<projectId>/<jobId>/...`
- `renders/<projectId>/<renderJobId>/...`
- `ai-visualizations/<userId>/<projectId>/...`

## Background job

```text
API
  ↓
Redis / BullMQ
  ↓
Capability worker
  ↓
Supabase Storage + PostgreSQL Job/result state
```

Các capability chạy dài được tách thành worker:

- `asset-processing` — validation/analysis/normalization.
- `export` — bake customized GLB, ghép variant và chuyển đổi OBJ/STL.
- `render` — Blender multi-view và spin-360.
- `geometry` — dữ kiện/issue khả năng sản xuất bằng Trimesh.
- `ai-visualization` — tạo lifestyle image qua hàng đợi phía server.

API là queue producer và lưu trạng thái `QUEUED/PROCESSING/RETRYING/COMPLETED/FAILED`. Worker cập nhật cùng bản ghi Job trong database và lưu object key/kết quả artifact riêng.

## Pipeline export

Canonical export:

```text
immutable source GLB
  + saved/current Configuration
  + persisted Manifest
  + MaterialPreset catalogue
  + ComponentVariant catalogue/private variant GLB
  → glTF Transform document
  → bake transforms/dimensions/material/color/visibility/delete
  → composite replaced variants
  → apply whole-product placement
  → write GLB
  → Khronos validation
  → private Supabase export artifact
```

OBJ/STL được suy ra **sau khi** customized GLB đã được bake/kiểm tra, vì vậy không tạo thêm một đường business state khác. Do GLB/glTF dùng đơn vị tuyến tính là meter trong khi OBJ/STL không có trường unit đáng tin cậy, tọa độ manufacturing dẫn xuất được export theo millimeter chuẩn của platform.

## Render / AI / manufacturing

- Render job yêu cầu completed GLB export thuộc cùng project/user.
- AI Design Suggest yêu cầu configuration hiện tại + completed project multi-view render và chỉ nhận các catalog ID/rule hợp lệ. Structured provider output được kiểm tra lại trước khi trở thành editor action có thể áp dụng.
- Lifestyle visualization dùng current render làm product reference và tạo PNG artifact riêng; nó không thay đổi canonical model state.
- Deterministic manufacturing rule đánh giá manifest/configuration/material metadata.
- Geometry manufacturing analysis chạy trên **customized exported GLB**, không phải source geometry.

## Collection và RFQ

Collection recommendation là deterministic domain engine sử dụng trọng số theo specification:

`50% style + 25% material + 15% color + 10% metadata khác`.

RFQ state tham chiếu một ModelVersion đã lưu thực tế và export hiện tại của project đã được xác minh, cùng render/manufacturing resource tùy chọn đã xác minh. Canonical payload lưu object key/ID; signed preview/export URL mới được sinh khi đọc.

## Frontend state và vòng đời GPU

Zustand chỉ lưu editor state có thể serialize. Object Three.js không được lưu làm business state.

Các resource viewer ở runtime được clone/sở hữu bởi projection layer và chủ động dispose geometry/material/texture khi model/variant bị thay hoặc unload. Cache GLTF của Drei và cache variant được clear khi teardown để giảm tích lũy GPU memory.

## Ranh giới bảo mật

- Quyền sở hữu có xác thực được kiểm tra cho tài nguyên project/version/export/render/manufacturing/RFQ.
- Source asset luôn bất biến.
- AI/provider secret và Supabase service secret chỉ tồn tại phía server.
- GLB upload được kiểm tra; nội dung glTF extension chỉ là dữ liệu, không phải executable application code.
- Không dùng `eval` tùy ý cho công thức dependency/manufacturing.
- AI output được kiểm tra theo schema/catalog/rule trước khi áp dụng trong editor.

## Ranh giới kiểm chứng

CI của repository kiểm tra TypeScript build, Prisma generation, syntax Python worker, domain/integration test và các GLB fixture bắt buộc. Bằng chứng E2E cho external/native system thật (Supabase, Redis worker, Blender, OpenAI, device AR và round trip export→re-import đầy đủ) được theo dõi riêng trong `PHASE1_GAP_AUDIT.md` thay vì ngầm coi compilation là đủ.

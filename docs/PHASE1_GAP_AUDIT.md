# Đánh giá khoảng trống Definition-of-Done của Phase 1

Nguồn: `3D_Product_Customization_Agent_Spec.md`, phần **Definition of Done — Phase 1** và các kịch bản fixture bắt buộc.

Chú thích trạng thái:

- ✅ đã triển khai và có bằng chứng từ code/test/build trong repository.
- 🟡 đã triển khai trong code nhưng phụ thuộc runtime/provider bên ngoài hoặc còn thiếu bằng chứng từ hệ thống live.
- ❌ chưa triển khai.

Bản audit này chủ động phân biệt **implementation**, **bằng chứng regression CI có tính xác định** và **bằng chứng từ hệ thống đã deploy thật**.

| # | Bước demo bắt buộc | Trạng thái | Bằng chứng trong repository / ranh giới |
|---|---|---|---|
| 1 | Import model GLB | ✅ | Signed Supabase upload, ModelAsset có owner và luồng import trên web; Chromium CI chạy đường import qua trình duyệt với boundary bên ngoài được mock. |
| 2 | Hệ thống phân tích model | ✅ | Asset worker kiểm tra GLB, phân tích source index/island/cảnh báo chất lượng model, normalize và lưu kết quả. |
| 3 | Người dùng review/cấu hình Component Manifest | ✅ | Asset Preparation UI + route lưu manifest; được chạy trong Chromium CI. |
| 4 | Mở editor | ✅ | Save manifest chuyển sang editor state; được chạy trong Chromium CI. |
| 5 | Đặt vị trí model | ✅ | Move/rotate toàn bộ model trước khi Lock. |
| 6 | Lock vị trí | ✅ | Lock gate chặn component customization trước Lock và bật sau Lock; được chạy trong Chromium CI. |
| 7 | Chọn component | ✅ | Chọn từ tree hoặc trực tiếp trong 3D với highlight. |
| 8 | Resize trong giới hạn | ✅ | Dimension action theo axis + validation min/max/scaling-mode; được chạy trong Chromium CI. |
| 9 | Đổi material/color | ✅ | Material/color action có kiểm tra compatibility và projection realtime; đường material được chạy trong Chromium CI. |
| 10 | Thay component tương thích | ✅ | Variant catalog/replacement/AUTO_FIT và composition ở final export. |
| 11 | Áp dụng style/preset | ✅ | Style và user-preset transaction tạo editor action thông thường. |
| 12 | Undo/Redo | ✅ | Snapshot history và integration/domain test thực thi được; được chạy trong Chromium CI. |
| 13 | Lưu version | ✅ | ModelVersion lưu snapshot configuration; đường Save Version trên trình duyệt được chạy trong Chromium CI với API boundary mock. |
| 14 | Reload project và giữ nguyên trạng thái chính xác | ✅ | Đường hydrate project/version + assertion integration cho serialization/reload chính xác. |
| 15 | Chạy AI Suggest và nhận structured action | 🟡 | Đã triển khai phía server với render input, schema-constrained provider response và quota; cần OpenAI + render runtime được cấu hình để có bằng chứng live. |
| 16 | Áp dụng AI suggestion hợp lệ qua validator | ✅ | AI validation chỉ tạo action đã được kiểm tra; web áp dụng qua `dispatchBatch` / editor pipeline thông thường. |
| 17 | Chạy Manufacturability Check | ✅ | Deterministic manufacturing rule được test bằng Vitest và Trimesh geometry analyzer thật được cài/chạy trong standard CI với cả bốn GLB fixture. Live BullMQ/storage orchestration vẫn là ranh giới certification ở staging, không phải implementation gap. |
| 18 | Render preview | 🟡 | Đã có Blender multi-view/SPIN_360 queue/worker; Blender binary không được chạy trong standard CI. |
| 19 | Export customized GLB | ✅ | Bake configuration hiện tại/đã lưu, ghép variant và Khronos validation trước khi lưu; lệnh Export trên browser được chạy trong Chromium CI với API boundary mock. |
| 20 | Re-import GLB đã export thành công | 🟡 | GLB export được Khronos Validator kiểm tra trước khi hoàn tất. Workflow `Staging E2E` chạy thủ công đã có để thực hiện live export→download→kiểm tra header GLB→re-import→analyze khi staging deployment và test credential được cấu hình; vẫn là 🟡 cho tới khi workflow đó chạy thành công trên môi trường live. |
| 21 | Mở AR preview với configuration hiện tại | 🟡 | Đã có current-configuration export + AR path; AR trên device/browser thật chưa được chạy trong standard CI. |
| 22 | Sinh RFQ payload | ✅ | Persisted Workshop/RFQ flow với saved version, dimensions/components/materials/issues/previews/export reference và signed artifact URL mới. |

## Các kịch bản model bắt buộc

| Kịch bản | Trạng thái | Bằng chứng |
|---|---|---|
| Model multi-component chuẩn | ✅ | `examples/fixtures/proper-components.glb` + Khronos fixture test + Chromium critical-flow fixture + Trimesh worker smoke. |
| Một mesh có nhiều geometry island rời rạc | ✅ | `examples/fixtures/disconnected-islands.glb` + analyzer island behavior/test + Trimesh assertion cho nhiều body. |
| Một mesh liên tục fallback/cảnh báo | ✅ | `examples/fixtures/continuous-mesh.glb` + warning/fallback behavior + Trimesh assertion cho một body. |
| Multi-material fixture theo test strategy | ✅ | `examples/fixtures/multi-material.glb`, được Khronos validate và Trimesh analyze trong CI. |

## Tóm tắt coverage theo acceptance criteria

### Asset import

- Hiển thị/import GLB hợp lệ: đã triển khai.
- Liệt kê candidate cho multi-mesh: đã triển khai.
- Phát hiện candidate geometry rời rạc trong một mesh: đã triển khai.
- Không giả vờ có semantic split: đã triển khai; region được ghi rõ là geometry candidate chưa xác nhận.
- Lưu/reload manifest: đã triển khai.

### Place/Lock

- Move/rotate toàn bộ model trước Lock: đã triển khai.
- Chặn component customization control trước Lock: đã triển khai trong editor rule/validation flow.
- Edit component sau Lock: đã triển khai.
- Placement vẫn là configuration state có thể serialize thay vì mutation chỉ tồn tại trong scene.

### Component customization

- Chọn/highlight trực tiếp trong viewer: đã triển khai.
- Validation editable axis/min/max: đã triển khai.
- Realtime projection sau action hợp lệ: đã triển khai.
- Chuyển đổi unit về mm nội bộ: đã triển khai/test.
- Dependency resolve sau thay đổi nguồn: đã triển khai/test.

### Material/color/variant

- Thực thi material compatibility: đã triển khai.
- Realtime material/color: đã triển khai.
- Version persistence + khôi phục qua Undo: đã triển khai.
- Variant compatibility/catalog flow, metadata anchor/AUTO_FIT và Undo/Redo: đã triển khai.
- Variant được composited vào GLB export cuối thay vì bị từ chối khi export.

## Trạng thái test/bằng chứng

### Browser E2E có tính xác định — ✅

CI chính chạy Playwright/Chromium critical-flow regression bằng UI Next.js thật, GLB fixture thật, Three.js/R3F viewer, editor state, Action/Constraint pipeline và Undo/Redo. Chỉ các network boundary bên ngoài như Supabase/API được mock để test có tính xác định.

Đường browser được bao phủ:

`Sign in → Import GLB → Asset Preparation → Save Manifest → Place/Lock → Dimension → Material → Undo → Redo → Create Project → Save Version → Export GLB`.

Đây là bằng chứng regression UI/browser. Chủ động **không** mô tả nó là bằng chứng một stack Supabase/PostgreSQL/Redis/worker đã deploy đang hoạt động khỏe mạnh.

### CI cho native geometry worker — ✅

Standard CI cài `workers/geometry/requirements.txt` và chạy `workers/geometry/analyze.py` trên cả bốn GLB fixture của Phase 1. Smoke test xác minh geometry fact không rỗng, phát hiện body rời rạc, issue `geometry:multiple-bodies` và trường hợp continuous-mesh chỉ có một body.

Điều này chứng minh Trimesh runtime thật trên GitHub runner sạch. Nó không thay thế live queue/storage smoke test cho geometry worker service đã deploy.

### Đường Live staging E2E — đã có, bằng chứng runtime đang chờ

`.github/workflows/staging-e2e.yml` là workflow live-system chạy thủ công. Khi cấu hình environment `staging` và các secret sau:

- `STAGING_WEB_URL`
- `STAGING_E2E_EMAIL`
- `STAGING_E2E_PASSWORD`

workflow sẽ chạy ứng dụng đã deploy và hạ tầng bên ngoài thật thay vì route mock.

Staging test upload `proper-components.glb`, chờ asset pipeline thật, chỉnh sửa/lưu/export project, tải customized GLB, kiểm tra binary header `glTF`, re-import chính bytes đã download thành asset mới và chờ analyzer đạt lại trạng thái `Asset: ready`.

Việc workflow tồn tại không được tính là live proof thành công cho tới khi có một staging run thực tế chạy thành công.

### Observability — đã triển khai, đang chờ bằng chứng ingestion

API cung cấp `/api/metrics` tương thích Prometheus, suy ra metric worker/job từ PostgreSQL state đã lưu, nhận telemetry `viewer_load_time` có xác thực và hỗ trợ scrape bearer token tùy chọn. Standard test kiểm tra exposition output. Vẫn cần một production metrics backend thật để scrape và xác minh dashboard/alert trên môi trường deployment đã chọn.

### Provider/runtime bên ngoài

Standard CI kiểm tra TypeScript build/test, syntax Python, executable Trimesh geometry analysis và deterministic Chromium flow. Nó không chạy Blender, live Supabase signed storage/queue orchestration hoặc OpenAI request. Các mục này cần staging/deployment smoke path cùng cấu hình provider/runtime.

## Thứ tự đóng các gap còn lại được khuyến nghị

1. Cấu hình staging deployment + GitHub `staging` environment secret và chạy `Staging E2E` thành công.
2. Thêm live smoke coverage cho deployed geometry queue và Blender preview/render worker; bản thân Trimesh đã được chạy trong standard CI.
3. Chạy AR preview trên ít nhất một mobile/device browser được hỗ trợ và lưu bằng chứng.
4. Thêm controlled live AI Suggest smoke test với quota/cost guardrail.
5. Kết nối `/api/metrics` với metrics backend của deployment và xác minh scrape ingestion, dashboard và alert.
6. Giữ Chromium critical-flow và Trimesh fixture smoke test là bước bắt buộc trong CI để ngăn regression.

Cho tới khi các mục live-system ở trên được chạy, repository nên được mô tả là **đã hoàn tất tính năng Phase 1 trong code, có bằng chứng browser critical-flow và native Trimesh runtime, nhưng vẫn còn các khoảng trống certification cho deployment/provider thật**, không nên mô tả là đã được production-certified hoàn toàn.

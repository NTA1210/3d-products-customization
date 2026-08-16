# Trạng thái triển khai

File này mô tả **ranh giới hiện tại giữa code và bằng chứng kiểm chứng**, không phải kế hoạch bootstrap ban đầu. Một tính năng không được đánh dấu hoàn tất chỉ vì đã có route hoặc button; các khả năng phụ thuộc runtime/provider được chỉ rõ riêng.

## P0 — đã triển khai trong code

### Import và chuẩn bị asset
- Quyền sở hữu asset import thông qua Supabase Auth.
- Supabase Storage riêng tư với signed upload/download grant cho trình duyệt; object key nguồn là bất biến.
- GLB là input chuẩn, có guardrail MIME/metadata và giới hạn kích thước upload có thể cấu hình.
- Kiểm tra Khronos glTF trước và sau normalization.
- Normalize bằng glTF Transform với hỗ trợ Draco/Meshopt.
- Stable source node/mesh/primitive ID dựa trên index glTF thay vì tên mesh.
- Phát hiện các candidate triangle-island rời rạc cho asset một mesh mà không khẳng định đây là semantic segmentation.
- Cảnh báo chất lượng model cho trường hợp thiếu material/UV, node rỗng, tên trùng, một mesh, island rời rạc, fallback một mesh liên tục, triangle count cao, texture resolution/encoded size cao và root scale đáng ngờ/không đồng đều.
- UI Asset Preparation cho name/role/editability/axes/scaling mode/dimension constraints/material categories/variant group/anchors/region mapping/dependencies/visibility.
- Component Manifest được lưu bền vững.

### Editor core
- Cổng Place → Lock → Customize.
- Chọn/highlight component trực tiếp.
- Width/height/depth với validation editable-axis và min/max.
- Position/rotation của component, material/color, delete/restore/reset.
- Chuyển đổi `mm`, `cm`, `inch` về đơn vị nội bộ chuẩn là millimeter.
- Action schema có cấu trúc và pipeline dùng chung Constraint / Compatibility / Dependency.
- Undo/Redo và batch transaction.
- Three.js scene ở runtime vẫn chỉ là projection của configuration có thể serialize.
- Công thức dependency theo cách xác định; không dùng `eval` tùy ý.

### Persistence và output
- Project CRUD/list/load/duplicate có xác thực.
- Snapshot cấu hình ModelVersion và đường reload chính xác.
- Export GLB tùy chỉnh có hỗ trợ variant, được tạo từ source bất biến + configuration.
- Kiểm tra GLB được sinh ra bằng Khronos trước khi lưu.
- Export OBJ/STL được suy ra từ GLB tùy chỉnh đã bake; tọa độ output dùng millimeter.
- Export artifact sử dụng object key Supabase riêng thay vì ghi đè source asset.

## P1 — đã triển khai trong code

### Material / variant / style / preset
- Thư viện material và kiểm tra compatibility.
- Component variant catalog, signed variant asset riêng tư, replacement và metadata AUTO_FIT.
- Ghép variant trong realtime viewer và final GLB export.
- Transaction cho style rule và user preset đi qua cùng editor action pipeline.

### Render / 360 / AR
- BullMQ render job với Blender headless worker.
- Render multi-view cho catalog/phân tích thiết kế.
- Render frame spin-360.
- Luồng AR theo cấu hình hiện tại dựa trên một GLB đã export.

### AI
- Request Design Suggest có cấu trúc, được tạo từ configuration hiện tại, constraint trong manifest và các catalog ID hợp lệ.
- Gọi provider ở server với quota theo giờ.
- Kiểm tra response có cấu trúc chặt chẽ cùng validation Action/Constraint/Compatibility trước khi người dùng áp dụng.
- Hàng đợi lifestyle visualization phía server dùng current product render làm image reference; PNG được tạo ra lưu riêng tư trong Supabase.
- Credential AI chỉ tồn tại phía server.

### Khả năng sản xuất
- Manufacturing rule engine theo cách xác định dựa trên configuration hiện tại và metadata material.
- Lưu bền vững báo cáo issue và editor action gợi ý khi rule có cung cấp.
- Trimesh worker tính geometry fact/issue trên **GLB tùy chỉnh hiện tại đã export**.

## P2 / Tuần 6 — đã triển khai trong code

### Collection
- Collection recommendation engine theo cách xác định.
- Trọng số theo spec: 50% style, 25% material, 15% color, 10% metadata khác/category/component.
- Persisted collection catalog và API/UI trả breakdown điểm số.

### Workshop / RFQ
- Persistence cho Workshop, QuoteRequest và Quote.
- RFQ canonical payload bao gồm project/version, dimensions, trạng thái component, material, manufacturing issue, preview object key và export object key.
- API read sẽ hydrate signed preview/export URL mới; signed URL hết hạn không được lưu làm business state.
- Kiểm tra quyền sở hữu cho saved version/export/render/manufacturing resource.
- Vòng đời `SUBMITTED → RECEIVED → ACCEPTED | REJECTED`, cùng lazy transition sang `EXPIRED` cho request quá hạn.

## QA / hardening đã triển khai

- Bốn nhóm GLB fixture bắt buộc:
  1. component chuẩn,
  2. một mesh có các island rời rạc,
  3. một mesh liên tục duy nhất,
  4. model multi-material.
- Fixture được kiểm tra bằng Khronos glTF Validator trong test thực thi được.
- Domain test bao phủ logic action/constraint/compatibility/dependency/unit/manufacturing/version/preset/collection.
- Critical-flow integration test bao phủ Lock guard, dimension/material/color, Undo/Redo và serialization/reload configuration chính xác.
- Viewer sở hữu và dispose các GPU resource đã clone; cache GLTF/variant được clear khi teardown.
- Error boundary ở cấp app hiển thị lỗi thân thiện với người dùng và tránh hiển thị raw production stack trace.
- CI chạy Prisma generation, kiểm tra syntax Python worker, test và production build TypeScript/Next.
- Asset analysis/render/AI/manufacturability phát structured log cho duration/outcome; các worker khác vẫn lưu Job lifecycle/failure record bền vững.
- Runbook triển khai production và lệnh setup private Supabase bucket có tính idempotent.

## Các khoảng trống bằng chứng trước khi có thể tuyên bố toàn bộ specification đã hoàn tất một cách chứng minh được

Các mục sau chủ động **chưa được đánh dấu hoàn tất**:

1. **Browser-level full-system E2E:** CI hiện không chạy Playwright/Cypress với Postgres + Redis + Supabase Auth/Storage + toàn bộ worker thật. Critical-flow test hiện tại ở mức domain/integration.
2. **Tự động hóa live export round-trip:** mọi GLB được sinh ra đều được validator kiểm tra trong export worker, nhưng CI hiện không chạy round trip worker thật `export → signed download → import/analyze lại`.
3. **Smoke coverage cho external runtime:** Blender, Trimesh job, Supabase signed storage và OpenAI provider call cần service native/external đã deploy và không được chạy trong standard repository CI.
4. **Tự động hóa preview RFQ:** RFQ chấp nhận một completed render đã được xác minh và sau đó mang các preview image, nhưng luồng tiện ích web hiện tại không bắt buộc Blender preview render trước mọi RFQ; preview array có thể rỗng.
5. **AI explanation riêng cho manufacturing issue:** structured design suggestion và deterministic/geometry manufacturing report đã có, nhưng chưa có endpoint provider-backed riêng chỉ dùng để giải thích manufacturing issue.
6. **Vendor metrics backend:** structured log và duration field phù hợp cho metric đã có, nhưng việc export sang Prometheus/Datadog/OpenTelemetry phụ thuộc deployment và chưa được đóng gói sẵn.
7. **Audit dependency/browser compatibility:** việc căn chỉnh peer dependency của package và kiểm chứng AR/performance trên thiết bị/trình duyệt thật vẫn cần kiểm tra ở cấp môi trường.

Xem `PHASE1_GAP_AUDIT.md` để biết mapping 22 bước Definition-of-Done.

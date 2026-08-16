# Ma trận case model 3D và chiến lược xử lý

Tài liệu này mô tả cách hệ thống phải xử lý các cấu trúc glTF/GLB thường gặp và edge case khi chuẩn bị model cho customization. Nguyên tắc quan trọng: **geometry boundary chỉ là tín hiệu kỹ thuật; không được tự suy diễn semantic role như TOP, LEG, FRAME nếu người dùng chưa xác nhận.**

## 1. Thứ tự ưu tiên componentization

1. **Source node + mesh + primitive rõ ràng** → dùng làm component candidate ổn định.
2. **Một source mesh nhưng có nhiều disconnected geometry island hợp lý** → dùng island làm candidate để người dùng xác nhận/tách component.
3. **Một continuous mesh** → giữ một component, không tự cắt bằng phỏng đoán.
4. **Dynamic geometry (skin/morph/instancing/animation)** → ưu tiên bảo toàn behavior; không auto-split geometry.
5. Mọi candidate mặc định là `UNKNOWN`, `FIXED`, `editable=false` cho đến Asset Preparation.

## 2. Case matrix

| Case | Dấu hiệu | Cách xử lý |
|---|---|---|
| Multi-node / multi-mesh | Nhiều node/mesh độc lập | Tạo candidate theo node + mesh + primitive. Đây là case an toàn nhất. |
| Một node, mesh có nhiều primitive | Thường do nhiều material/draw call | Mỗi primitive là candidate riêng. Khi export phải tách child node nếu các primitive có transform khác nhau. |
| Shared mesh được nhiều node tham chiếu | Cùng mesh index nhưng nhiều node transform | Component identity chứa node ID; export clone/isolate theo node để instance A không làm đổi instance B. |
| Single mesh, 2–32 disconnected islands | Ví dụ bàn export thành một mesh nhưng mặt/chân rời nhau | Tạo region component candidates; role vẫn `UNKNOWN` cho đến khi user xác nhận. Viewer và export dùng cùng topology ordering. |
| Single mesh, >32 islands | Hardware, screw, landing gear, scan/kitbash | Không tạo hàng trăm component tự động. Giữ source component và yêu cầu manual preparation. Ngưỡng cấu hình bằng `ASSET_MAX_AUTO_REGIONS`. |
| Single continuous mesh | Toàn bộ hình học nối liền | Một component fallback. Không tự suy luận semantic part từ topology. |
| Non-indexed geometry | Mỗi triangle có thể sở hữu vertex riêng | Weld vertex theo vị trí với tolerance rất nhỏ trước khi tìm connected region; tránh hiểu mỗi triangle là một component. |
| Sparse accessor | POSITION/index được lưu bằng glTF sparse accessor | Loader phải expand sparse accessor về mảng đầy đủ trước topology. CI có native sparse-accessor smoke để tránh regression. |
| UV/normal seam làm duplicate vertex | Vị trí trùng/khớp nhưng index khác | Topology detector weld theo position, không chỉ dựa raw index. |
| Degenerate triangle | Tam giác có vertex trùng nhau | Ghi INFO, không crash; vẫn giữ asset nếu glTF hợp lệ. |
| Invalid triangle/index | Index ngoài range | Loại khỏi topology candidate và báo WARNING; validator vẫn là gate chính. |
| Primitive POINTS/LINES/STRIP/FAN | `mode != TRIANGLES` | Viewer có thể hiển thị nếu loader hỗ trợ, nhưng không auto-componentize/resize như solid part. |
| Missing material | Primitive không có material | Cho xem; báo warning; chỉ cho material/color sau khi user xác nhận editable. |
| Missing UV | Không có `TEXCOORD_0` | Color vẫn khả dụng; texture-based material có thể bị giới hạn/cảnh báo. |
| Skinned mesh | Có skin/joint/weight | Không auto-split island; tách geometry có thể phá skeleton. Giữ source-aligned và read-only mặc định. |
| Morph target | Primitive có morph target | Không auto-split; giữ deformation data. |
| Animation | Có animation channel | Cảnh báo vì manual transform có thể xung đột animation; yêu cầu explicit preparation. |
| GPU instancing | `EXT_mesh_gpu_instancing` / runtime InstancedMesh | Không biến từng instance thành editable component mặc định; cần workflow riêng nếu muốn instance-level editing. |
| Material variants | `KHR_materials_variants` | Ưu tiên map thành variant/material option thay vì tạo geometry component mới. |
| Draco / Meshopt | Geometry compressed | Decode qua loader/worker đã đăng ký codec; component ID không phụ thuộc byte offset sau compression. |
| Không có scene | `scenes` rỗng/không tồn tại nhưng có entity/mesh | glTF cho phép dùng như asset library, nhưng product editor cần một sản phẩm có scene. Import fail rõ bằng `PRODUCT_SCENE_REQUIRED`. |
| Nhiều scene | `scenes.length > 1` | Dùng authored default scene; nếu thiếu default thì normalized derivative chọn scene đầu tiên. Cảnh báo để user xác nhận product scene; không coi scene khác là component. |
| Không có default scene | Có scene nhưng root `scene` không được authored | Normalized derivative đặt scene đầu tiên làm default để viewer/worker deterministic; canonical source không bị overwrite. |
| Root non-uniform / negative scale | Node hierarchy có scale khác 1 hoặc mirror | Tính physical bounds trước khi Lock; cảnh báo zero/non-invertible, mirrored và extreme non-uniform scale. |
| Model rất lớn / rất nhỏ | Bounds lệch nhiều bậc độ lớn | Auto-fit camera, clip range rộng; canonical business unit vẫn là mm. |
| Triangle count lớn | Vượt `ASSET_TRIANGLE_WARNING_THRESHOLD` | Warning + tránh thao tác topology tốn kém không cần thiết; background worker chịu trách nhiệm analysis. |
| Duplicate/empty names | Tên trùng hoặc rỗng | Tên chỉ là display label; business ID dùng stable node/mesh/primitive/region ID. |
| Hidden/deleted part | Configuration runtime | Không raycast/select part đã ẩn; export phải phản ánh đúng visibility/deletion. |
| Extension optional chưa hiểu | Chỉ nằm trong `extensionsUsed` | Không tự biến thành business semantics; validator/loader quyết định phần core còn dùng được hay không. |
| Extension không hỗ trợ nhưng required | Nằm trong `extensionsRequired` nhưng không thuộc extension đã đăng ký | **Fail import** bằng `UNSUPPORTED_REQUIRED_EXTENSION`; không được bỏ qua vì có thể làm sai geometry/rendering semantics. |

## 3. Topology detector dùng chung

Package `@product3d/geometry-topology` cung cấp thuật toán deterministic cho worker/editor/export:

- hỗ trợ indexed và non-indexed TRIANGLES;
- weld coincident position để nối lại UV/normal seams;
- tìm connected triangle regions;
- trả về triangle list, vertex list, bounds và tolerance;
- không gán semantic role;
- có classifier cho source parts, region candidates, continuous mesh, quá nhiều region và dynamic geometry.

Điều này tránh tình trạng worker hiểu một cấu trúc nhưng viewer/export hiểu cấu trúc khác.

## 4. Chính sách an toàn

- `UNKNOWN / FIXED / editable=false` là mặc định.
- Chỉ component được user/manifest xác nhận mới được chỉnh.
- Mọi resize/position/material/color phải đi qua `EditorAction` → schema → constraint → compatibility → dependency → apply.
- Geometry island chỉ là candidate, không phải semantic truth.
- Khi không thể tách an toàn, fallback đúng là **một component + warning**, không phải đoán.
- Canonical GLB của khách hàng không bị overwrite; mọi normalization/componentization runtime đều là derivative/projection.
- Nếu một feature của glTF là **required** nhưng runtime không hiểu, import phải fail thay vì render một model có thể sai semantics.
- Mọi componentization mới phải có evidence ở cả viewer và export/re-import nếu nó ảnh hưởng cấu trúc geometry.

## 5. Evidence bắt buộc trong CI

Các case có nguy cơ làm sai geometry hiện được kiểm chứng bằng nhiều lớp:

- `Vitest`: topology, quality guardrails, product-scene policy, required-extension policy.
- `Trimesh smoke`: geometry runtime độc lập.
- `region export smoke`: region component → export GLB → glTF Validator → re-import → giữ triangle count.
- `structure export smoke`: shared mesh và multi-primitive được transform độc lập rồi validate/re-import.
- `sparse accessor smoke`: glTF sparse POSITION được decode thành accessor đầy đủ trước topology.
- `Chromium E2E`: user flow import → preparation → select → direct edit → save/export.

## 6. Case `dinner_table_002.glb`

Asset này thuộc nhóm **single mesh + nhiều disconnected islands**. Vì vậy hệ thống tạo region candidates để người dùng xác nhận thành các part có thể chỉnh riêng, thay vì chỉ hiển thị một component cho toàn bộ bàn. Sau khi region được xác nhận, mỗi part có thể được gán role, editable axes, min/max, material category, anchor và dependency riêng.

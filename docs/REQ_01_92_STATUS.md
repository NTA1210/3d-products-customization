# REQ-01 → REQ-92 implementation status

Nguồn scope: tài liệu **YÊU CẦU HỆ THỐNG 3D PRODUCT CUSTOMIZATION**.

Quy ước:
- ✅ Implemented in code: có schema/domain/API/UI/worker path phù hợp với requirement.
- 🟡 Runtime certification: code path đã có nhưng cần provider/native runtime/live infrastructure để chứng minh end-to-end trên môi trường deploy.
- ⚪ Optional by scope: không bắt buộc triển khai trong scope hiện tại.

> Scope decision: **REQ-18 Min/Max constraint** và **REQ-27 Fine-tune sắc độ** không phải điều kiện bắt buộc để đóng specification hiện tại. Code vẫn giữ constraint hiện có; REQ-27 không được dùng làm release gate.

## 1. Model / Component — REQ-01..06

| REQ | Status | Evidence / behavior |
|---|---|---|
| 01 | ✅ | Customer-owned GLB asset library, ownership + private storage. |
| 02 | ✅ | Model Manifest maps independent editable components/regions. |
| 03 | ✅ | Component list + dependencies + logical attachments persisted. |
| 04 | ✅ | Semantic component roles. |
| 05 | ✅ | Dimensions, transform, material, style tags, scale rules and anchors. |
| 06 | ✅ | Variant group/role/model-tag/semantic-anchor compatibility + material compatibility. |

## 2. Viewer — REQ-07..11

REQ-07, 08, 09, 10, 11: **✅**. Viewer loads customer asset, supports orbit/pan/zoom, direct and tree selection, highlight, and realtime projection of configuration changes.

## 3. Manual customization — REQ-12..21

REQ-12..17, 19..21: **✅**. Dimension input/slider/unit conversion, per-axis resize, per-axis Move/Rotate permissions, deterministic dependencies, reset/delete and Undo/Redo are implemented.

REQ-18: **⚪ Optional by scope**. Existing Manifest range constraints and validator remain supported.

## 4. Material / Color — REQ-22..28

REQ-22..26 and 28: **✅**.
- Material catalog is persisted and hydrated from API into the editor validation/runtime catalog.
- Material-category compatibility is enforced.
- Color is per component.
- ColorPreset catalog stores hex, style tags and compatible material categories.
- Material/color projection is realtime.

REQ-27: **⚪ Optional by scope**. Manual hex/color input still exists, but fine-tune hue is not a release gate.

## 5. Component variants — REQ-29..34

REQ-29..34: **✅**.
- Variant catalog + replacement.
- Group/role/model-tag compatibility validation.
- Semantic anchor placement shared by viewer and GLB export.
- AUTO_FIT dimension policy.
- Legacy CENTER variants remain backward compatible.

## 6. Style — REQ-35..40

REQ-35..40: **✅**.
- Style catalog and rule transactions.
- Model/component/material/color style metadata.
- Style can apply component/material/color/dimension/variant rules supported by the preset engine.
- Manual editing remains available after style apply.

## 7. Preset — REQ-41..48

REQ-41..48: **✅**.
- Authenticated user preset library.
- Preset rules support component variant, dimensions, material, color and visibility.
- Apply remains editable.
- Reset Preset reconstructs preset baseline as one Undo-able transaction.

## 8. AI Design Suggest — REQ-49..59

REQ-49..59: **✅ implementation**, with provider calls **🟡 runtime certification** when OpenAI is not configured in standard CI.
- Current configuration is exported and MULTI_VIEW rendered.
- Vision receives render images + metadata/catalog/constraints.
- Strict structured output supports dimension/material/color/variant and APPLY_STYLE proposals.
- APPLY_STYLE resolves to normal editor actions server-side.
- All resolved actions pass normal validation before user Apply.

## 9. Vision LLM — REQ-60..63

REQ-60..63: **✅ implementation / 🟡 provider certification**. Front/right/top/perspective render assets and current metadata are provided to the Vision provider.

## 10. Generate Image / Visualization — REQ-64..67

REQ-64..67: **✅ implementation / 🟡 provider certification**.
- Generation uses current product render as image reference.
- Generated artifact is private and project-owned.
- A post-generation Vision consistency review compares authoritative source render vs generated output.
- Server scores Shape, Component Structure and Material/Color preservation and derives PASS/REVIEW using fixed thresholds.
- REVIEW warns but does not delete the generated image.

## 11. Save / Version — REQ-68..73

REQ-68..73: **✅**. Project/version snapshots persist component/variant/transform/material/color/style/preset state, support Undo/Redo, and Reset Product preserves approved placement while resetting customization.

## 12. Export — REQ-74..78

REQ-74..78: **✅ implementation** with format-specific fidelity and **🟡 Blender runtime certification** for GLTF/FBX/USDZ.

Supported paths:
- GLB — canonical full customized export + Khronos validation.
- GLTF — Blender conversion from the already-customized GLB, single embedded artifact.
- FBX — Blender conversion from the already-customized GLB.
- USDZ — Blender USD exporter from the already-customized GLB.
- OBJ — Trimesh derived export in millimeters.
- STL — geometry-only Trimesh derived export in millimeters.

All derived formats start from the baked customized GLB rather than immutable source. Job metadata records fidelity class because STL/OBJ/FBX/USDZ cannot guarantee identical PBR semantics to GLB.

## 13. Manufacturability — REQ-79..86

REQ-79..86: **✅ implementation**, with Vision explanation **🟡 provider certification**.
- Deterministic rules and Trimesh geometry analysis remain authoritative.
- Current configuration + current customized export are analyzed.
- MULTI_VIEW Vision review receives issue metadata + component dimensions/material + available geometry facts.
- AI explanation is restricted to known deterministic issue IDs; invented issue IDs are rejected.
- Visual observations are advisory and cannot create authoritative failures by themselves.

## 14. Collection — REQ-87..92

REQ-87..92: **✅ implementation**, with REQ-92 **🟡 provider certification**.
- Deterministic collection rank remains 50% style / 25% material / 15% color / 10% other.
- AI explanation receives the already-ranked candidates and breakdown only.
- AI cannot change ranking or score; unknown product IDs are rejected.

## Release interpretation

After the feature PRs containing this document land, the codebase covers all **90 required REQs** in the current scope (92 total minus optional REQ-18 and REQ-27) at implementation level.

This must **not** be interpreted as production certification of external/native runtimes. The following still require deployed-environment proof:
1. Blender execution for GLTF/FBX/USDZ and render jobs.
2. OpenAI Vision/Image provider calls for AI Suggest, Manufacturability explanation, Collection explanation and Visualization consistency.
3. Live Supabase/Redis/worker orchestration and staging export/re-import.
4. USDZ validation on a real supported iOS/AR consumer and FBX validation in at least one target DCC application.

Standard repository CI remains responsible for schema/domain tests, Python syntax/runtime checks available on the runner, production build and Chromium critical-flow regression.
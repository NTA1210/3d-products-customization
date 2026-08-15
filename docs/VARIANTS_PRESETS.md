# Variants, anchors, styles and presets

Variant catalog rows point to private Supabase Storage objects. `prisma:seed` uploads the bundled `wide-top-variant.glb` example when Supabase environment variables are configured.

`GET /api/variants?groupId=&role=` returns compatible catalog metadata plus a short-lived signed asset URL. Runtime replacement uses bounds-center AUTO_FIT for the current component dimensions. Variant choice is stored as `configuration.components[id].variantId`, so Undo/Redo and Version snapshots include it.

Style and user-preset rules use `@product3d/preset-engine`. Selectors target a stable component ID or semantic role. The compiler emits normal `EditorAction` objects, then `editor-core.applyActions` performs the same schema/constraint/compatibility/dependency path as manual edits. A style/preset is committed to history as one transaction in the web store.

Current anchor support includes manifest anchor definitions and the catalog's `BOUNDS_CENTER` auto-fit policy. Additional POINT/PLANE/AXIS authoring can be stored in `manifest.anchors` and is extended by later advanced fitting rules.

# GLB export pipeline

`POST /api/projects/:id/export` resolves either an explicit configuration snapshot, a saved version, or the active version. The shared schemas validate the manifest/configuration before a BullMQ export job is created.

The export worker:
1. downloads the immutable source GLB from private Supabase Storage;
2. clones source mesh primitives per configured node to avoid mutating shared mesh instances;
3. applies current dimensions, component translation/rotation/scale, visibility/delete state, material presets and color override;
4. applies whole-product placement through a wrapper node;
5. writes a new GLB;
6. validates the result with Khronos glTF Validator;
7. stores the artifact at `exports/<project>/<job>/<filename>`;
8. exposes a short-lived download URL through `GET /api/jobs/:id/artifact`.

Active `variantId` currently fails with `EXPORT_VARIANT_NOT_COMPOSITED` rather than producing a visually incorrect file. Variant asset composition is implemented in the subsequent variant/anchor slice.

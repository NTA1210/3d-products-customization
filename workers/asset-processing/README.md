# Asset processing worker

Real P0 GLB validation/normalization worker.

Pipeline:
1. Consume `asset-processing` BullMQ jobs from Redis.
2. Download the source GLB from S3-compatible storage.
3. Validate against glTF 2.0 with the Khronos `gltf-validator` package.
4. Parse with glTF Transform, register standard extensions + Draco dependencies, then run lossless `prune()` and `dedup()` transforms.
5. Re-serialize to GLB and validate the normalized bytes again.
6. Upload `assets/{assetId}/normalized/model.glb`.
7. Persist asset/job status, validation report, and before/after scene statistics in PostgreSQL.

Run locally after infrastructure and migrations are ready:

```bash
pnpm --filter @product3d/asset-processing-worker dev
```

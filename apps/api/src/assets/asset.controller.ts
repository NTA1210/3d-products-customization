import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Post, Put, Query } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';
import { AssetQueueService } from '../queue/asset-queue.service';
import { StorageService } from '../storage/storage.service';

const MAX_ASSET_BYTES = Number(process.env.MAX_ASSET_BYTES ?? 250 * 1024 * 1024);
const ImportAssetSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  originalFilename: z.string().trim().min(1).max(255),
  contentType: z.string().trim().min(1).max(120).default('model/gltf-binary'),
  sizeBytes: z.number().int().positive().max(MAX_ASSET_BYTES).optional(),
});

function safeFilename(filename: string) {
  const value = filename.replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^\.+/, '').slice(0, 180);
  return value || 'model.glb';
}

@Controller('assets')
export class AssetController {
  constructor(
    private readonly db: PrismaService,
    private readonly storage: StorageService,
    private readonly assetQueue: AssetQueueService,
  ) {}

  @Post('import')
  async importAsset(@Body() body: unknown) {
    const parsed = ImportAssetSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    const input = parsed.data;
    if (!input.originalFilename.toLowerCase().endsWith('.glb')) {
      throw new BadRequestException('Phase 1 production upload currently accepts .glb files only.');
    }

    const id = randomUUID();
    const sourceObjectKey = `assets/${id}/source/${safeFilename(input.originalFilename)}`;
    const asset = await this.db.modelAsset.create({
      data: {
        id,
        name: input.name ?? input.originalFilename.replace(/\.glb$/i, ''),
        originalFilename: input.originalFilename,
        contentType: input.contentType,
        sizeBytes: input.sizeBytes,
        sourceObjectKey,
        sourceUrl: this.storage.objectUri(sourceObjectKey),
        status: 'AWAITING_UPLOAD',
      },
    });
    const upload = await this.storage.createUploadGrant(sourceObjectKey);
    return { asset, upload };
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    const asset = await this.db.modelAsset.findUnique({ where: { id } });
    if (!asset) throw new NotFoundException('Asset not found.');
    return asset;
  }

  @Post(':id/analyze')
  async analyze(@Param('id') id: string) {
    const asset = await this.db.modelAsset.findUnique({ where: { id } });
    if (!asset) throw new NotFoundException('Asset not found.');
    if (!asset.sourceObjectKey) throw new BadRequestException('Asset has no source object key.');
    try {
      await this.storage.assertObjectExists(asset.sourceObjectKey);
    } catch {
      throw new BadRequestException('Uploaded GLB was not found in Supabase Storage. Complete the signed upload first.');
    }

    const databaseJob = await this.db.job.create({
      data: {
        type: 'ASSET_VALIDATE_NORMALIZE',
        status: 'QUEUED',
        modelAssetId: id,
        payload: {
          assetId: id,
          sourceObjectKey: asset.sourceObjectKey,
          originalFilename: asset.originalFilename,
        },
      },
    });

    try {
      const queued = await this.assetQueue.enqueue({
        assetId: id,
        databaseJobId: databaseJob.id,
        sourceObjectKey: asset.sourceObjectKey,
        originalFilename: asset.originalFilename,
      });
      await this.db.$transaction([
        this.db.job.update({ where: { id: databaseJob.id }, data: { bullmqJobId: String(queued.id) } }),
        this.db.modelAsset.update({ where: { id }, data: { status: 'QUEUED' } }),
      ]);
      return { jobId: databaseJob.id, status: 'QUEUED' };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Queue unavailable';
      await this.db.job.update({ where: { id: databaseJob.id }, data: { status: 'FAILED', failureReason: message } });
      throw error;
    }
  }

  @Get(':id/download')
  async download(@Param('id') id: string, @Query('kind') kind = 'normalized') {
    const asset = await this.db.modelAsset.findUnique({ where: { id } });
    if (!asset) throw new NotFoundException('Asset not found.');
    const objectKey = kind === 'source' ? asset.sourceObjectKey : asset.normalizedObjectKey;
    if (!objectKey) throw new NotFoundException(`${kind} asset is not available.`);
    return { url: await this.storage.createDownloadUrl(objectKey), expiresInSeconds: 900 };
  }

  @Get(':id/manifest')
  async getManifest(@Param('id') id: string) {
    return this.db.modelManifest.findFirst({ where: { modelAssetId: id }, orderBy: { version: 'desc' } });
  }

  @Put(':id/manifest')
  async saveManifest(@Param('id') id: string, @Body() body: { manifestJson: unknown }) {
    const latest = await this.db.modelManifest.findFirst({ where: { modelAssetId: id }, orderBy: { version: 'desc' } });
    return this.db.modelManifest.create({
      data: { modelAssetId: id, version: (latest?.version ?? 0) + 1, manifestJson: body.manifestJson as object },
    });
  }
}

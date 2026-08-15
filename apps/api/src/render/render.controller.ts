import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { AuthRequest, requireAuthUser, SupabaseAuthGuard } from '../auth/auth.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  RenderQueueService,
  type RenderMode,
  type RenderQuality,
} from '../queue/render-queue.service';
import { StorageService } from '../storage/storage.service';

const RequestSchema = z.object({
  projectId: z.string().min(1),
  exportJobId: z.string().min(1),
  mode: z.enum(['MULTI_VIEW', 'SPIN_360']),
  quality: z.enum(['DRAFT', 'STANDARD', 'HIGH']).default('STANDARD'),
  frameCount: z.number().int().min(12).max(120).optional(),
});

type RenderAsset = { index: number; view?: string; objectKey: string; filename: string };

@Controller('render-jobs')
@UseGuards(SupabaseAuthGuard)
export class RenderController {
  constructor(
    private readonly db: PrismaService,
    private readonly queue: RenderQueueService,
    private readonly storage: StorageService,
  ) {}

  @Post()
  async create(@Req() request: AuthRequest, @Body() body: unknown) {
    const user = requireAuthUser(request);
    const parsed = RequestSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    const input = parsed.data;

    const project = await this.db.project.findFirst({
      where: { id: input.projectId, userId: user.id },
    });
    if (!project) throw new NotFoundException('Project not found.');

    const exportJob = await this.db.job.findFirst({
      where: {
        id: input.exportJobId,
        type: 'GLB_EXPORT',
        status: 'COMPLETED',
        modelAssetId: project.modelAssetId,
      },
    });
    if (!exportJob) throw new BadRequestException('A completed export job for this project is required.');
    const exportPayload = exportJob.payload as Record<string, unknown>;
    if (exportPayload.projectId !== project.id || exportPayload.userId !== user.id) {
      throw new BadRequestException('Export job does not belong to this project and user.');
    }
    const result = exportJob.result as Record<string, unknown> | null;
    const sourceObjectKey = typeof result?.objectKey === 'string' ? result.objectKey : undefined;
    if (!sourceObjectKey) throw new BadRequestException('Export job does not contain a GLB artifact.');

    const frameCount = input.mode === 'MULTI_VIEW' ? 6 : input.frameCount ?? 36;
    const dbJob = await this.db.job.create({
      data: {
        type: 'RENDER',
        status: 'QUEUED',
        modelAssetId: project.modelAssetId,
        payload: {
          projectId: project.id,
          userId: user.id,
          sourceExportJobId: exportJob.id,
          mode: input.mode,
          quality: input.quality,
          frameCount,
        },
      },
    });
    const renderJob = await this.db.renderJob.create({
      data: {
        userId: user.id,
        projectId: project.id,
        jobId: dbJob.id,
        sourceExportJobId: exportJob.id,
        mode: input.mode,
        quality: input.quality,
        frameCount,
      },
    });

    try {
      const queued = await this.queue.enqueue({
        databaseJobId: dbJob.id,
        renderJobId: renderJob.id,
        projectId: project.id,
        userId: user.id,
        sourceObjectKey,
        mode: input.mode as RenderMode,
        quality: input.quality as RenderQuality,
        frameCount,
      });
      await this.db.job.update({
        where: { id: dbJob.id },
        data: { bullmqJobId: String(queued.id) },
      });
      return { id: renderJob.id, jobId: dbJob.id, status: 'QUEUED', frameCount };
    } catch (error) {
      await this.db.job.update({
        where: { id: dbJob.id },
        data: { status: 'FAILED', failureReason: error instanceof Error ? error.message : String(error) },
      });
      throw error;
    }
  }

  private async owned(id: string, userId: string) {
    const row = await this.db.renderJob.findFirst({
      where: { id, userId },
      include: { job: true },
    });
    if (!row) throw new NotFoundException('Render job not found.');
    return row;
  }

  @Get(':id')
  async get(@Req() request: AuthRequest, @Param('id') id: string) {
    const row = await this.owned(id, requireAuthUser(request).id);
    return {
      id: row.id,
      projectId: row.projectId,
      mode: row.mode,
      quality: row.quality,
      frameCount: row.frameCount,
      status: row.job.status,
      failureReason: row.job.failureReason,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  @Get(':id/assets')
  async assets(@Req() request: AuthRequest, @Param('id') id: string) {
    const row = await this.owned(id, requireAuthUser(request).id);
    if (row.job.status !== 'COMPLETED') throw new BadRequestException('Render job is not completed.');
    const result = row.job.result as { assets?: RenderAsset[] } | null;
    const assets = result?.assets ?? [];
    return Promise.all(
      assets.map(async (asset) => ({
        ...asset,
        url: await this.storage.createDownloadUrl(asset.objectKey, 900),
      })),
    );
  }
}

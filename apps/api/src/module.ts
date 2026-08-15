import { Body, Controller, Get, HttpException, HttpStatus, Module, Param, Post, Put } from '@nestjs/common';
import { AssetController } from './assets/asset.controller';
import { JobController } from './jobs/job.controller';
import { PrismaService } from './prisma/prisma.service';
import { AssetQueueService } from './queue/asset-queue.service';
import { StorageService } from './storage/storage.service';

@Controller('health')
class HealthController {
  @Get()
  health() {
    return { ok: true, service: 'product3d-api' };
  }
}

@Controller('projects')
class ProjectController {
  constructor(private readonly db: PrismaService) {}

  @Post()
  create(@Body() body: { userId: string; modelAssetId: string; name: string }) {
    return this.db.project.create({ data: body });
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.db.project.findUniqueOrThrow({ where: { id }, include: { versions: true, modelAsset: true } });
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() body: { name?: string; activeVersionId?: string }) {
    return this.db.project.update({ where: { id }, data: body });
  }

  @Post(':id/versions')
  async saveVersion(
    @Param('id') id: string,
    @Body() body: { name: string; configurationJson: unknown; previewUrl?: string },
  ) {
    const version = await this.db.modelVersion.create({
      data: {
        projectId: id,
        name: body.name,
        configurationJson: body.configurationJson as object,
        previewUrl: body.previewUrl,
      },
    });
    await this.db.project.update({ where: { id }, data: { activeVersionId: version.id } });
    return version;
  }

  @Get(':id/versions')
  versions(@Param('id') id: string) {
    return this.db.modelVersion.findMany({ where: { projectId: id }, orderBy: { createdAt: 'desc' } });
  }

  @Post(':id/export')
  export() {
    throw new HttpException('GLB export worker is not configured yet.', HttpStatus.NOT_IMPLEMENTED);
  }

  @Post(':id/manufacturability/check')
  check() {
    throw new HttpException('Manufacturability worker is not configured yet.', HttpStatus.NOT_IMPLEMENTED);
  }
}

@Controller('materials')
class MaterialController {
  constructor(private readonly db: PrismaService) {}

  @Get()
  all() {
    return this.db.materialPreset.findMany({ where: { active: true } });
  }

  @Get(':id')
  one(@Param('id') id: string) {
    return this.db.materialPreset.findUniqueOrThrow({ where: { id } });
  }
}

@Module({
  controllers: [HealthController, AssetController, JobController, ProjectController, MaterialController],
  providers: [PrismaService, StorageService, AssetQueueService],
})
export class AppModule {}

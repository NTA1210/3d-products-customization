import {Controller,Get,Module} from '@nestjs/common';
import {AssetController} from './assets/asset.controller';
import {AuthController} from './auth/auth.controller';
import {SupabaseAuthGuard} from './auth/auth.service';
import {CatalogController} from './catalog/catalog.controller';
import {JobController} from './jobs/job.controller';
import {PrismaService} from './prisma/prisma.service';
import {ProjectController} from './projects/project.controller';
import {AssetQueueService} from './queue/asset-queue.service';
import {ExportQueueService} from './queue/export-queue.service';
import {RenderQueueService} from './queue/render-queue.service';
import {RenderController} from './render/render.controller';
import {StorageService} from './storage/storage.service';

@Controller('health')
class HealthController{@Get()health(){return{ok:true,service:'product3d-api'}}}

@Controller('materials')
class MaterialController{
  constructor(private readonly db:PrismaService){}
  @Get()all(){return this.db.materialPreset.findMany({where:{active:true}})}
}

@Module({
  controllers:[HealthController,AuthController,AssetController,CatalogController,JobController,ProjectController,MaterialController,RenderController],
  providers:[PrismaService,StorageService,AssetQueueService,ExportQueueService,RenderQueueService,SupabaseAuthGuard],
})
export class AppModule{}

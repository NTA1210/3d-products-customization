import {Controller,Get,Module} from '@nestjs/common';
import {ColorPresetSchema,MaterialPresetSchema} from '@product3d/model-schema';
import {AiController} from './ai/ai.controller';
import {AiProviderService} from './ai/ai-provider.service';
import {VisualizationConsistencyController} from './ai/visualization-consistency.controller';
import {AssetController} from './assets/asset.controller';
import {AuthController} from './auth/auth.controller';
import {SupabaseAuthGuard} from './auth/auth.service';
import {CatalogController} from './catalog/catalog.controller';
import {CollectionController} from './collection/collection.controller';
import {JobController} from './jobs/job.controller';
import {ManufacturingController} from './manufacturing/manufacturing.controller';
import {MetricsController,MetricsService} from './metrics/metrics.controller';
import {PrismaService} from './prisma/prisma.service';
import {ProjectController} from './projects/project.controller';
import {AiVisualizationQueueService} from './queue/ai-visualization-queue.service';
import {AssetQueueService} from './queue/asset-queue.service';
import {ExportQueueService} from './queue/export-queue.service';
import {GeometryQueueService} from './queue/geometry-queue.service';
import {RenderQueueService} from './queue/render-queue.service';
import {RenderController} from './render/render.controller';
import {StorageService} from './storage/storage.service';
import {WorkshopController} from './workshop/workshop.controller';

@Controller('health')
class HealthController{@Get()health(){return{ok:true,service:'product3d-api'}}}

@Controller()
class SurfaceCatalogController{
  constructor(private readonly db:PrismaService){}
  @Get('materials') async materials(){
    const rows=await this.db.materialPreset.findMany({where:{active:true},orderBy:{name:'asc'}});
    return rows.map(row=>MaterialPresetSchema.parse({id:row.id,name:row.name,category:row.category,...(row.propertiesJson as object),styleTags:row.styleTags}));
  }
  @Get('colors') async colors(){
    const rows=await this.db.colorPreset.findMany({where:{active:true},orderBy:{name:'asc'}});
    return rows.map(row=>ColorPresetSchema.parse({id:row.id,name:row.name,hex:row.hex,styleTags:row.styleTags,compatibleMaterialCategories:row.compatibleMaterialCategories}));
  }
}

@Module({
  controllers:[HealthController,AuthController,AssetController,CatalogController,CollectionController,JobController,ProjectController,SurfaceCatalogController,RenderController,AiController,VisualizationConsistencyController,ManufacturingController,WorkshopController,MetricsController],
  providers:[PrismaService,StorageService,AssetQueueService,ExportQueueService,RenderQueueService,GeometryQueueService,AiVisualizationQueueService,SupabaseAuthGuard,AiProviderService,MetricsService],
})
export class AppModule{}

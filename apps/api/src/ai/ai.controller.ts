import {BadRequestException,Body,Controller,HttpException,HttpStatus,NotFoundException,Param,Post,Req,UseGuards} from '@nestjs/common';
import {Prisma} from '@prisma/client';
import {validateAiDesignResponse} from '@product3d/ai-engine';
import {ComponentVariantSchema,MaterialPresetSchema,ModelConfigurationSchema,ModelManifestSchema} from '@product3d/model-schema';
import {z} from 'zod';
import {AuthRequest,requireAuthUser,SupabaseAuthGuard} from '../auth/auth.service';
import {PrismaService} from '../prisma/prisma.service';
import {StorageService} from '../storage/storage.service';
import {AiProviderService} from './ai-provider.service';

const RequestSchema=z.object({configurationJson:ModelConfigurationSchema,renderJobId:z.string().min(1),instructions:z.string().max(6000).optional()});
type RenderAsset={view?:string;objectKey:string;filename:string};

@Controller('projects/:projectId/ai')
@UseGuards(SupabaseAuthGuard)
export class AiController{
  constructor(private readonly db:PrismaService,private readonly provider:AiProviderService,private readonly storage:StorageService){}

  @Post('design-suggestions')
  async suggestions(@Req()request:AuthRequest,@Param('projectId')projectId:string,@Body()body:unknown){
    const user=requireAuthUser(request);
    const parsed=RequestSchema.safeParse(body);
    if(!parsed.success)throw new BadRequestException(parsed.error.flatten());
    const limit=Number(process.env.AI_SUGGESTIONS_PER_HOUR??20);
    const since=new Date(Date.now()-60*60*1000);
    const recent=await this.db.aIRequest.count({where:{userId:user.id,type:'DESIGN_SUGGESTION',createdAt:{gte:since}}});
    if(recent>=limit)throw new HttpException(`AI suggestion quota exceeded (${limit}/hour).`,HttpStatus.TOO_MANY_REQUESTS);

    const project=await this.db.project.findFirst({where:{id:projectId,userId:user.id},include:{modelAsset:{include:{manifests:{orderBy:{version:'desc'},take:1}}}}});
    if(!project)throw new NotFoundException('Project not found.');
    const manifestRecord=project.modelAsset.manifests[0];
    if(!manifestRecord)throw new BadRequestException('Project asset has no saved manifest.');
    const manifest=ModelManifestSchema.parse(manifestRecord.manifestJson);
    const configuration=parsed.data.configurationJson;
    if(configuration.modelId!==manifest.modelId)throw new BadRequestException('Configuration does not match the project manifest.');

    const render=await this.db.renderJob.findFirst({where:{id:parsed.data.renderJobId,userId:user.id,projectId},include:{job:true}});
    if(!render||render.mode!=='MULTI_VIEW'||render.job.status!=='COMPLETED')throw new BadRequestException('A completed MULTI_VIEW render for this project is required.');
    const renderAssets=((render.job.result as {assets?:RenderAsset[]}|null)?.assets??[]).filter(asset=>['front','right','top','perspective'].includes(asset.view??''));
    if(!renderAssets.some(asset=>asset.view==='perspective'))throw new BadRequestException('Perspective render is required for AI suggestions.');
    const imageUrls=await Promise.all(renderAssets.map(asset=>this.storage.createDownloadUrl(asset.objectKey,1800)));

    const [materialRows,variantRows,styleRows]=await Promise.all([
      this.db.materialPreset.findMany({where:{active:true}}),
      this.db.componentVariant.findMany({where:{active:true}}),
      this.db.stylePreset.findMany({where:{active:true}}),
    ]);
    const materials=materialRows.map(row=>MaterialPresetSchema.parse({id:row.id,name:row.name,category:row.category,...(row.propertiesJson as object),styleTags:row.styleTags}));
    const variants=variantRows.map(row=>ComponentVariantSchema.parse({id:row.id,groupId:row.groupId,name:row.name,role:row.role,assetUrl:row.assetUrl,...(row.metadataJson as object)}));
    const catalog={materialIds:new Set(materials.map(v=>v.id)),variantIds:new Set(variants.map(v=>v.id)),styleIds:new Set(styleRows.map(v=>v.id)),componentIds:new Set(manifest.components.map(v=>v.id))};

    const providerInput={
      modelMetadata:{projectId,modelId:manifest.modelId,components:manifest.components.map(c=>({id:c.id,name:c.name,role:c.role,editable:c.editable,editableAxes:c.editableAxes,scalingMode:c.scalingMode,constraints:c.constraints,variantGroupId:c.variantGroupId,allowedMaterialCategories:c.allowedMaterialCategories}))},
      currentConfiguration:configuration,
      availableMaterialIds:[...catalog.materialIds],
      availableVariantIds:[...catalog.variantIds],
      availableStyleIds:[...catalog.styleIds],
      availableComponentIds:[...catalog.componentIds],
      customerInstructions:parsed.data.instructions??'',
      constraintSummary:manifest.components.map(c=>({componentId:c.id,constraints:c.constraints,editableAxes:c.editableAxes,scalingMode:c.scalingMode})),
    };
    const prompt=`You are the design assistant for a constrained 3D product configurator. Return only schema-conforming suggestions. Never invent component, material, variant or style IDs. Every action must use source AI. Do not claim an action is valid merely because geometric scaling is possible; respect editability, constraints and compatibility. The user must explicitly apply suggestions later.\n\nINPUT:\n${JSON.stringify(providerInput)}`;

    const requestRow=await this.db.aIRequest.create({data:{userId:user.id,projectId,type:'DESIGN_SUGGESTION',provider:process.env.AI_PROVIDER??'disabled',model:process.env.OPENAI_DESIGN_MODEL,status:'PROCESSING',inputJson:providerInput as Prisma.InputJsonValue}});
    try{
      const providerResult=await this.provider.designSuggestions({prompt,imageUrls});
      const validated=validateAiDesignResponse({response:providerResult.response,manifest,configuration,catalog,materials,variants});
      await this.db.aIRequest.update({where:{id:requestRow.id},data:{provider:providerResult.provider,model:providerResult.model,status:'COMPLETED',resultJson:validated as unknown as Prisma.InputJsonValue,error:null}});
      return{id:requestRow.id,...validated};
    }catch(error){
      await this.db.aIRequest.update({where:{id:requestRow.id},data:{status:'FAILED',error:error instanceof Error?error.message:String(error)}});
      throw error;
    }
  }
}

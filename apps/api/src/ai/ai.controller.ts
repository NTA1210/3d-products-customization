import {BadRequestException,Body,Controller,HttpException,HttpStatus,NotFoundException,Param,Post,Req,UseGuards} from '@nestjs/common';
import {Prisma} from '@prisma/client';
import {validateAiDesignResponse} from '@product3d/ai-engine';
import {ComponentVariantSchema,MaterialPresetSchema,ModelConfigurationSchema,ModelManifestSchema} from '@product3d/model-schema';
import {z} from 'zod';
import {AuthRequest,requireAuthUser,SupabaseAuthGuard} from '../auth/auth.service';
import {PrismaService} from '../prisma/prisma.service';
import {AiVisualizationQueueService} from '../queue/ai-visualization-queue.service';
import {StorageService} from '../storage/storage.service';
import {AiProviderService} from './ai-provider.service';

const RequestSchema=z.object({configurationJson:ModelConfigurationSchema,renderJobId:z.string().min(1),instructions:z.string().max(6000).optional()});
const VisualizationSchema=z.object({renderJobId:z.string().min(1),prompt:z.string().trim().min(1).max(3000)});
type RenderAsset={view?:string;objectKey:string;filename:string};
type VariantCompatibility={roles?:string[];modelTags?:string[]};
type VariantMetadata={anchorType?:string;dimensionPolicy?:string};

@Controller('projects/:projectId/ai')
@UseGuards(SupabaseAuthGuard)
export class AiController{
  constructor(private readonly db:PrismaService,private readonly provider:AiProviderService,private readonly storage:StorageService,private readonly visualization:AiVisualizationQueueService){}

  private async enforceQuota(userId:string,type:string,limit:number){const since=new Date(Date.now()-60*60*1000),recent=await this.db.aIRequest.count({where:{userId,type,createdAt:{gte:since}}});if(recent>=limit)throw new HttpException(`AI quota exceeded (${limit}/hour).`,HttpStatus.TOO_MANY_REQUESTS);}

  @Post('design-suggestions')
  async suggestions(@Req()request:AuthRequest,@Param('projectId')projectId:string,@Body()body:unknown){
    const user=requireAuthUser(request),parsed=RequestSchema.safeParse(body);
    if(!parsed.success)throw new BadRequestException(parsed.error.flatten());
    await this.enforceQuota(user.id,'DESIGN_SUGGESTION',Number(process.env.AI_SUGGESTIONS_PER_HOUR??20));
    const project=await this.db.project.findFirst({where:{id:projectId,userId:user.id},include:{modelAsset:{include:{manifests:{orderBy:{version:'desc'},take:1}}}}});
    if(!project)throw new NotFoundException('Project not found.');
    const manifestRecord=project.modelAsset.manifests[0];if(!manifestRecord)throw new BadRequestException('Project asset has no saved manifest.');
    const manifest=ModelManifestSchema.parse(manifestRecord.manifestJson),configuration=parsed.data.configurationJson;
    if(configuration.modelId!==manifest.modelId)throw new BadRequestException('Configuration does not match the project manifest.');
    const render=await this.db.renderJob.findFirst({where:{id:parsed.data.renderJobId,userId:user.id,projectId},include:{job:true}});
    if(!render||render.mode!=='MULTI_VIEW'||render.job.status!=='COMPLETED')throw new BadRequestException('A completed MULTI_VIEW render for this project is required.');
    const renderAssets=((render.job.result as {assets?:RenderAsset[]}|null)?.assets??[]).filter(asset=>['front','right','top','perspective'].includes(asset.view??''));
    if(!renderAssets.some(asset=>asset.view==='perspective'))throw new BadRequestException('Perspective render is required for AI suggestions.');
    const imageUrls=await Promise.all(renderAssets.map(asset=>this.storage.createDownloadUrl(asset.objectKey,1800)));
    const[materialRows,variantRows,styleRows]=await Promise.all([this.db.materialPreset.findMany({where:{active:true}}),this.db.componentVariant.findMany({where:{active:true}}),this.db.stylePreset.findMany({where:{active:true}})]);
    const materials=materialRows.map(row=>MaterialPresetSchema.parse({id:row.id,name:row.name,category:row.category,...(row.propertiesJson as object),styleTags:row.styleTags}));
    const variants=variantRows.map(row=>{const compatibility=(row.compatibilityJson??{}) as VariantCompatibility,metadata=(row.metadataJson??{}) as VariantMetadata;return ComponentVariantSchema.parse({id:row.id,groupId:row.groupId,name:row.name,role:row.role,assetUrl:row.assetUrl,anchorType:metadata.anchorType??'BOUNDS_CENTER',compatibleModelTags:compatibility.modelTags??[],compatibleComponentRoles:compatibility.roles??[row.role],dimensionPolicy:metadata.dimensionPolicy??'KEEP'});});
    const catalog={materialIds:new Set(materials.map(v=>v.id)),variantIds:new Set(variants.map(v=>v.id)),styleIds:new Set(styleRows.map(v=>v.id)),componentIds:new Set(manifest.components.map(v=>v.id))};
    const availableStyles=styleRows.map(row=>({id:row.id,name:row.name,description:row.description,styleTags:row.styleTags}));
    const providerInput={modelMetadata:{projectId,modelId:manifest.modelId,modelTags:manifest.modelTags??[],components:manifest.components.map(c=>({id:c.id,name:c.name,role:c.role,styleTags:c.styleTags??[],editable:c.editable,editableAxes:c.editableAxes,scalingMode:c.scalingMode,constraints:c.constraints,variantGroupId:c.variantGroupId,allowedMaterialCategories:c.allowedMaterialCategories}))},currentConfiguration:configuration,availableMaterialIds:[...catalog.materialIds],availableVariantIds:[...catalog.variantIds],availableStyles,availableComponentIds:[...catalog.componentIds],customerInstructions:parsed.data.instructions??'',constraintSummary:manifest.components.map(c=>({componentId:c.id,constraints:c.constraints,editableAxes:c.editableAxes,scalingMode:c.scalingMode}))};
    const prompt=`You are the design assistant for a constrained 3D product configurator. Return only schema-conforming suggestions. Never invent component, material, variant or style IDs. You may suggest APPLY_STYLE only with a style ID listed in availableStyles. Every proposal action must use source AI. Respect editability, constraints and compatibility. The server expands styles into ordinary editor actions and validates them. The user explicitly applies suggestions later.\n\nINPUT:\n${JSON.stringify(providerInput)}`;
    const requestRow=await this.db.aIRequest.create({data:{userId:user.id,projectId,type:'DESIGN_SUGGESTION',provider:process.env.AI_PROVIDER??'disabled',model:process.env.OPENAI_DESIGN_MODEL,status:'PROCESSING',inputJson:providerInput as Prisma.InputJsonValue}});
    try{const providerResult=await this.provider.designSuggestions({prompt,imageUrls}),validated=validateAiDesignResponse({response:providerResult.response,manifest,configuration,catalog,materials,variants,styles:styleRows.map(row=>({id:row.id,rulesJson:row.rulesJson}))});await this.db.aIRequest.update({where:{id:requestRow.id},data:{provider:providerResult.provider,model:providerResult.model,status:'COMPLETED',resultJson:validated as unknown as Prisma.InputJsonValue,error:null}});return{id:requestRow.id,...validated};}
    catch(error){await this.db.aIRequest.update({where:{id:requestRow.id},data:{status:'FAILED',error:error instanceof Error?error.message:String(error)}});throw error;}
  }

  @Post('visualizations')
  async visualizations(@Req()request:AuthRequest,@Param('projectId')projectId:string,@Body()body:unknown){
    const user=requireAuthUser(request),parsed=VisualizationSchema.safeParse(body);if(!parsed.success)throw new BadRequestException(parsed.error.flatten());
    await this.enforceQuota(user.id,'VISUALIZATION',Number(process.env.AI_VISUALIZATIONS_PER_HOUR??10));
    const project=await this.db.project.findFirst({where:{id:projectId,userId:user.id}});if(!project)throw new NotFoundException('Project not found.');
    const render=await this.db.renderJob.findFirst({where:{id:parsed.data.renderJobId,userId:user.id,projectId},include:{job:true}});if(!render||render.job.status!=='COMPLETED')throw new BadRequestException('A completed current-project render is required.');
    const assets=(render.job.result as {assets?:RenderAsset[]}|null)?.assets??[],perspective=assets.find(asset=>asset.view==='perspective')??assets[0];if(!perspective)throw new BadRequestException('Render contains no visualization input image.');
    const ai=await this.db.aIRequest.create({data:{userId:user.id,projectId,type:'VISUALIZATION',provider:'openai',model:process.env.OPENAI_VISUALIZATION_MODEL,status:'QUEUED',inputJson:{renderJobId:render.id,prompt:parsed.data.prompt} as Prisma.InputJsonValue}});
    const job=await this.db.job.create({data:{type:'AI_VISUALIZATION',status:'QUEUED',modelAssetId:project.modelAssetId,payload:{projectId,userId:user.id,aiRequestId:ai.id,renderJobId:render.id}}});
    try{const queued=await this.visualization.enqueue({databaseJobId:job.id,aiRequestId:ai.id,projectId,userId:user.id,inputObjectKey:perspective.objectKey,prompt:parsed.data.prompt});await this.db.job.update({where:{id:job.id},data:{bullmqJobId:String(queued.id)}});return{id:ai.id,jobId:job.id,status:'QUEUED'};}
    catch(error){const message=error instanceof Error?error.message:String(error);await this.db.$transaction([this.db.job.update({where:{id:job.id},data:{status:'FAILED',failureReason:message}}),this.db.aIRequest.update({where:{id:ai.id},data:{status:'FAILED',error:message}})]);throw error;}
  }
}

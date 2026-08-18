import {BadGatewayException,BadRequestException,Body,Controller,Get,HttpException,HttpStatus,NotFoundException,Param,Post,Req,UseGuards} from '@nestjs/common';
import {Prisma} from '@prisma/client';
import {ManufacturingIssueSchema,ManufacturingRuleDefinitionSchema,runManufacturingRules,type ManufacturingRule} from '@product3d/manufacturing-engine';
import {ModelConfigurationSchema,ModelManifestSchema} from '@product3d/model-schema';
import {z} from 'zod';
import {AiProviderService,ManufacturingVisionResponseSchema} from '../ai/ai-provider.service';
import {AuthRequest,requireAuthUser,SupabaseAuthGuard} from '../auth/auth.service';
import {PrismaService} from '../prisma/prisma.service';
import {GeometryQueueService} from '../queue/geometry-queue.service';
import {StorageService} from '../storage/storage.service';

const VisionReviewSchema=z.object({manufacturingCheckId:z.string().min(1),renderJobId:z.string().min(1)});
type RenderAsset={view?:string;objectKey:string;filename:string};

@Controller('projects/:projectId/manufacturability')
@UseGuards(SupabaseAuthGuard)
export class ManufacturingController{
  constructor(private readonly db:PrismaService,private readonly geometry:GeometryQueueService,private readonly provider:AiProviderService,private readonly storage:StorageService){}

  private async enforceVisionQuota(userId:string){const since=new Date(Date.now()-60*60*1000),limit=Number(process.env.AI_MANUFACTURING_REVIEWS_PER_HOUR??10),recent=await this.db.aIRequest.count({where:{userId,type:'MANUFACTURING_VISION',createdAt:{gte:since}}});if(recent>=limit)throw new HttpException(`Manufacturing Vision quota exceeded (${limit}/hour).`,HttpStatus.TOO_MANY_REQUESTS);}

  @Post('check')
  async check(@Req()request:AuthRequest,@Param('projectId')projectId:string,@Body()body:{configurationJson:unknown;modelVersionId?:string}){
    const startedAt=Date.now(),user=requireAuthUser(request);console.info(JSON.stringify({event:'manufacturability_check_started',projectId,userId:user.id,modelVersionId:body.modelVersionId??null}));
    try{
      const configuration=ModelConfigurationSchema.safeParse(body.configurationJson);if(!configuration.success)throw new BadRequestException(configuration.error.flatten());
      const project=await this.db.project.findFirst({where:{id:projectId,userId:user.id},include:{modelAsset:{include:{manifests:{orderBy:{version:'desc'},take:1}}}}});if(!project)throw new NotFoundException('Project not found.');
      if(body.modelVersionId){const version=await this.db.modelVersion.findFirst({where:{id:body.modelVersionId,projectId}});if(!version)throw new BadRequestException('modelVersionId does not belong to this project.');}
      const manifestRecord=project.modelAsset.manifests[0];if(!manifestRecord)throw new BadRequestException('Project asset has no saved manifest.');const manifest=ModelManifestSchema.parse(manifestRecord.manifestJson);if(configuration.data.modelId!==manifest.modelId)throw new BadRequestException('Configuration does not match project manifest.');
      const[ruleRows,materials]=await Promise.all([this.db.manufacturingRule.findMany({where:{active:true}}),this.db.materialPreset.findMany({where:{active:true},select:{id:true,category:true}})]);const rules:ManufacturingRule[]=ruleRows.map(row=>({id:row.id,name:row.name,severity:row.severity as ManufacturingRule['severity'],definition:ManufacturingRuleDefinitionSchema.parse(row.ruleJson)}));const issues=runManufacturingRules({manifest,configuration:configuration.data,rules,materials});const check=await this.db.manufacturingCheck.create({data:{userId:user.id,projectId,modelVersionId:body.modelVersionId,configurationJson:configuration.data as Prisma.InputJsonValue,issuesJson:issues as unknown as Prisma.InputJsonValue,status:'COMPLETED'}});
      console.info(JSON.stringify({event:'manufacturability_check_completed',projectId,userId:user.id,checkId:check.id,ruleCount:rules.length,issueCount:issues.length,durationMs:Date.now()-startedAt}));return{id:check.id,status:check.status,issues};
    }catch(error){console.error(JSON.stringify({event:'manufacturability_check_failed',projectId,userId:user.id,durationMs:Date.now()-startedAt,error:error instanceof Error?error.message:String(error)}));throw error;}
  }

  @Post('vision-review')
  async visionReview(@Req()request:AuthRequest,@Param('projectId')projectId:string,@Body()body:unknown){
    const user=requireAuthUser(request),parsed=VisionReviewSchema.safeParse(body);if(!parsed.success)throw new BadRequestException(parsed.error.flatten());
    await this.enforceVisionQuota(user.id);
    const[project,check,render]=await Promise.all([
      this.db.project.findFirst({where:{id:projectId,userId:user.id},include:{modelAsset:{include:{manifests:{orderBy:{version:'desc'},take:1}}}}}),
      this.db.manufacturingCheck.findFirst({where:{id:parsed.data.manufacturingCheckId,projectId,userId:user.id}}),
      this.db.renderJob.findFirst({where:{id:parsed.data.renderJobId,projectId,userId:user.id},include:{job:true}}),
    ]);
    if(!project)throw new NotFoundException('Project not found.');
    if(!check)throw new NotFoundException('Manufacturing check not found.');
    if(!render||render.mode!=='MULTI_VIEW'||render.job.status!=='COMPLETED')throw new BadRequestException('A completed current-project MULTI_VIEW render is required.');
    const manifestRecord=project.modelAsset.manifests[0];if(!manifestRecord)throw new BadRequestException('Project asset has no saved manifest.');
    const manifest=ModelManifestSchema.parse(manifestRecord.manifestJson),configuration=ModelConfigurationSchema.parse(check.configurationJson);
    const issues=z.array(ManufacturingIssueSchema).parse(check.issuesJson);
    const assets=((render.job.result as{assets?:RenderAsset[]}|null)?.assets??[]).filter(asset=>['front','right','top','perspective'].includes(asset.view??''));
    if(!assets.some(asset=>asset.view==='perspective'))throw new BadRequestException('Perspective render is required for manufacturing Vision review.');
    const imageUrls=await Promise.all(assets.map(asset=>this.storage.createDownloadUrl(asset.objectKey,1800)));
    const componentSummary=manifest.components.map(component=>{const state=configuration.components[component.id];return{id:component.id,name:component.name,role:component.role,dimensionsMm:state?.dimensionsMm,materialId:state?.materialId,visible:state?.visible,deleted:state?.deleted};});
    const input={manufacturingCheckId:check.id,issues:issues.map(issue=>({id:issue.id,ruleId:issue.ruleId,severity:issue.severity,componentIds:issue.componentIds,message:issue.message,measuredValue:issue.measuredValue,expectedRange:issue.expectedRange})),geometryFacts:check.geometryJson??null,components:componentSummary};
    const prompt=`You are reviewing a product for manufacturability using MULTI_VIEW renders plus deterministic rule/geometry results. The deterministic rules and geometry analyzer are the authoritative source of manufacturing issues. Explain only issue IDs supplied in INPUT. Do not invent or upgrade a visual observation into an authoritative manufacturing failure. visualObservations may describe visible geometry/assembly concerns for a human to inspect. Explain each known issue in plain language, its likely impact, and a concrete next step.\n\nINPUT:\n${JSON.stringify(input)}`;
    const requestRow=await this.db.aIRequest.create({data:{userId:user.id,projectId,type:'MANUFACTURING_VISION',provider:process.env.AI_PROVIDER??'disabled',model:process.env.OPENAI_MANUFACTURING_MODEL??process.env.OPENAI_DESIGN_MODEL,status:'PROCESSING',inputJson:{...input,renderJobId:render.id} as Prisma.InputJsonValue}});
    try{
      const providerResult=await this.provider.manufacturingVision({prompt,imageUrls});
      const result=ManufacturingVisionResponseSchema.parse(providerResult.response),knownIds=new Set(issues.map(issue=>issue.id));
      const unknown=result.explanations.filter(item=>!knownIds.has(item.issueId)).map(item=>item.issueId);
      if(unknown.length)throw new BadGatewayException(`Vision provider explained unknown manufacturing issue IDs: ${unknown.join(', ')}`);
      await this.db.aIRequest.update({where:{id:requestRow.id},data:{provider:providerResult.provider,model:providerResult.model,status:'COMPLETED',resultJson:result as unknown as Prisma.InputJsonValue,error:null}});
      return{id:requestRow.id,manufacturingCheckId:check.id,renderJobId:render.id,...result,authoritativeSource:'RULE_AND_GEOMETRY'};
    }catch(error){await this.db.aIRequest.update({where:{id:requestRow.id},data:{status:'FAILED',error:error instanceof Error?error.message:String(error)}});throw error;}
  }

  @Post('geometry')
  async geometryCheck(@Req()request:AuthRequest,@Param('projectId')projectId:string,@Body()body:{manufacturingCheckId:string;exportJobId:string}){const user=requireAuthUser(request);const[project,check]=await Promise.all([this.db.project.findFirst({where:{id:projectId,userId:user.id}}),this.db.manufacturingCheck.findFirst({where:{id:body.manufacturingCheckId,projectId,userId:user.id}})]);if(!project)throw new NotFoundException('Project not found.');if(!check)throw new NotFoundException('Manufacturing check not found.');const exportJob=await this.db.job.findFirst({where:{id:body.exportJobId,type:'GLB_EXPORT',status:'COMPLETED',modelAssetId:project.modelAssetId}});const payload=exportJob?.payload as Record<string,unknown>|undefined,result=exportJob?.result as Record<string,unknown>|undefined;if(!exportJob||payload?.projectId!==projectId||payload?.userId!==user.id||typeof result?.objectKey!=='string')throw new BadRequestException('A completed current-project GLB export is required.');const job=await this.db.job.create({data:{type:'GEOMETRY_ANALYSIS',status:'QUEUED',modelAssetId:project.modelAssetId,payload:{projectId,userId:user.id,manufacturingCheckId:check.id,exportJobId:exportJob.id}}});await this.db.manufacturingCheck.update({where:{id:check.id},data:{status:'PROCESSING'}});try{const queued=await this.geometry.enqueue({databaseJobId:job.id,manufacturingCheckId:check.id,projectId,userId:user.id,sourceObjectKey:result.objectKey});await this.db.job.update({where:{id:job.id},data:{bullmqJobId:String(queued.id)}});console.info(JSON.stringify({event:'geometry_check_queued',projectId,userId:user.id,checkId:check.id,jobId:job.id}));return{jobId:job.id,checkId:check.id,status:'QUEUED'};}catch(error){await this.db.$transaction([this.db.job.update({where:{id:job.id},data:{status:'FAILED',failureReason:error instanceof Error?error.message:String(error)}}),this.db.manufacturingCheck.update({where:{id:check.id},data:{status:'FAILED'}})]);throw error;}}
  @Get('checks/:checkId') async get(@Req()request:AuthRequest,@Param('projectId')projectId:string,@Param('checkId')checkId:string){const row=await this.db.manufacturingCheck.findFirst({where:{id:checkId,projectId,userId:requireAuthUser(request).id}});if(!row)throw new NotFoundException('Manufacturing check not found.');return row;}
}

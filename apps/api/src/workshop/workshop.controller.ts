import {BadRequestException,Body,Controller,Get,NotFoundException,Param,Patch,Post,Req,UseGuards} from '@nestjs/common';
import {Prisma} from '@prisma/client';
import {ModelConfigurationSchema,ModelManifestSchema} from '@product3d/model-schema';
import {z} from 'zod';
import {AuthRequest,requireAuthUser,SupabaseAuthGuard} from '../auth/auth.service';
import {PrismaService} from '../prisma/prisma.service';
import {StorageService} from '../storage/storage.service';

const CreateRfqSchema=z.object({
  modelVersionId:z.string().min(1),workshopId:z.string().min(1),customerNote:z.string().max(4000).optional(),
  manufacturingCheckId:z.string().min(1).optional(),renderJobId:z.string().min(1).optional(),exportJobId:z.string().min(1),
  expiresAt:z.string().datetime().optional(),
});
const QuoteSchema=z.object({amountCents:z.number().int().nonnegative().optional(),currency:z.string().trim().length(3).default('USD'),leadTimeDays:z.number().int().nonnegative().optional(),terms:z.string().max(6000).optional(),responseJson:z.record(z.unknown()).optional()});
const StatusSchema=z.object({status:z.enum(['ACCEPTED','REJECTED'])});
type StoredPayload={projectId:string;modelVersionId:string;customerNote?:string;dimensions:Record<string,unknown>;components:unknown[];materials:string[];manufacturingIssues:unknown[];previewObjectKeys:string[];exportObjectKey:string};
type RenderAsset={objectKey:string;view?:string};

@Controller()
@UseGuards(SupabaseAuthGuard)
export class WorkshopController{
  constructor(private readonly db:PrismaService,private readonly storage:StorageService){}

  @Get('workshops')
  workshops(){return this.db.workshop.findMany({where:{active:true},orderBy:{name:'asc'}});}

  private async expireDue(userId?:string,projectId?:string){
    const result=await this.db.quoteRequest.updateMany({where:{...(userId?{userId}:{}),...(projectId?{projectId}:{}),expiresAt:{lt:new Date()},status:{in:['SUBMITTED','RECEIVED']}},data:{status:'EXPIRED'}});
    if(result.count)console.info(JSON.stringify({event:'rfq_expired',count:result.count,userId:userId??null,projectId:projectId??null}));
  }

  private async ownedRfq(id:string,userId:string){
    await this.expireDue(userId);
    const rfq=await this.db.quoteRequest.findFirst({where:{id,userId},include:{workshop:true,quotes:true}});
    if(!rfq)throw new NotFoundException('Quote request not found.');return rfq;
  }

  private async hydrate(payload:StoredPayload){
    const [previewImages,exportAssetUrl]=await Promise.all([
      Promise.all(payload.previewObjectKeys.map(key=>this.storage.createDownloadUrl(key,1800))),
      this.storage.createDownloadUrl(payload.exportObjectKey,1800),
    ]);
    return{projectId:payload.projectId,modelVersionId:payload.modelVersionId,customerNote:payload.customerNote??'',dimensions:payload.dimensions,components:payload.components,materials:payload.materials,manufacturingIssues:payload.manufacturingIssues,previewImages,exportAssetUrl};
  }

  @Post('projects/:projectId/rfq')
  async create(@Req()request:AuthRequest,@Param('projectId')projectId:string,@Body()body:unknown){
    const user=requireAuthUser(request),parsed=CreateRfqSchema.safeParse(body);if(!parsed.success)throw new BadRequestException(parsed.error.flatten());
    const expiresAt=parsed.data.expiresAt?new Date(parsed.data.expiresAt):undefined;if(expiresAt&&expiresAt.getTime()<=Date.now())throw new BadRequestException('expiresAt must be in the future.');
    const project=await this.db.project.findFirst({where:{id:projectId,userId:user.id},include:{modelAsset:{include:{manifests:{orderBy:{version:'desc'},take:1}}}}});
    if(!project)throw new NotFoundException('Project not found.');
    const [version,workshop,exportJob,check,render]=await Promise.all([
      this.db.modelVersion.findFirst({where:{id:parsed.data.modelVersionId,projectId}}),
      this.db.workshop.findFirst({where:{id:parsed.data.workshopId,active:true}}),
      this.db.job.findFirst({where:{id:parsed.data.exportJobId,type:'GLB_EXPORT',status:'COMPLETED',modelAssetId:project.modelAssetId}}),
      parsed.data.manufacturingCheckId?this.db.manufacturingCheck.findFirst({where:{id:parsed.data.manufacturingCheckId,projectId,userId:user.id}}):Promise.resolve(null),
      parsed.data.renderJobId?this.db.renderJob.findFirst({where:{id:parsed.data.renderJobId,projectId,userId:user.id},include:{job:true}}):Promise.resolve(null),
    ]);
    if(!version)throw new BadRequestException('modelVersionId does not belong to this project.');
    if(!workshop)throw new BadRequestException('Workshop is not available.');
    const exportPayload=exportJob?.payload as Record<string,unknown>|undefined,exportResult=exportJob?.result as Record<string,unknown>|undefined;
    if(!exportJob||exportPayload?.projectId!==projectId||exportPayload?.userId!==user.id||typeof exportResult?.objectKey!=='string')throw new BadRequestException('A completed export for this project/version is required.');
    if(parsed.data.manufacturingCheckId&&!check)throw new BadRequestException('Manufacturing check does not belong to this project.');
    if(parsed.data.renderJobId&&(!render||render.job.status!=='COMPLETED'))throw new BadRequestException('Render job is not completed for this project.');
    const manifestRecord=project.modelAsset.manifests[0];if(!manifestRecord)throw new BadRequestException('Project asset has no manifest.');
    const manifest=ModelManifestSchema.parse(manifestRecord.manifestJson),configuration=ModelConfigurationSchema.parse(version.configurationJson);
    if(configuration.modelId!==manifest.modelId)throw new BadRequestException('Saved version does not match project manifest.');
    const dimensions=Object.fromEntries(Object.entries(configuration.components).map(([id,state])=>[id,state.dimensionsMm]));
    const components=manifest.components.map(definition=>{const state=configuration.components[definition.id];return{id:definition.id,name:definition.name,role:definition.role,visible:state?.visible??false,deleted:state?.deleted??false,variantId:state?.variantId??null,transform:state?.transform??null};});
    const materials=[...new Set(Object.values(configuration.components).map(state=>state.materialId).filter((id):id is string=>Boolean(id)))];
    const renderResult=render?.job.result as {assets?:RenderAsset[]}|null;
    const stored:StoredPayload={projectId,modelVersionId:version.id,customerNote:parsed.data.customerNote,dimensions,components,materials,manufacturingIssues:(check?.issuesJson as unknown[])??[],previewObjectKeys:(renderResult?.assets??[]).map(asset=>asset.objectKey),exportObjectKey:exportResult.objectKey};
    const rfq=await this.db.quoteRequest.create({data:{userId:user.id,projectId,modelVersionId:version.id,workshopId:workshop.id,status:'SUBMITTED',customerNote:parsed.data.customerNote,payloadJson:stored as unknown as Prisma.InputJsonValue,submittedAt:new Date(),expiresAt}});
    return{...rfq,workshop,payload:await this.hydrate(stored)};
  }

  @Get('projects/:projectId/rfq')
  async list(@Req()request:AuthRequest,@Param('projectId')projectId:string){
    const user=requireAuthUser(request),project=await this.db.project.findFirst({where:{id:projectId,userId:user.id}});if(!project)throw new NotFoundException('Project not found.');
    await this.expireDue(user.id,projectId);
    const rows=await this.db.quoteRequest.findMany({where:{projectId,userId:user.id},include:{workshop:true,quotes:true},orderBy:{createdAt:'desc'}});
    return Promise.all(rows.map(async row=>({...row,payload:await this.hydrate(row.payloadJson as unknown as StoredPayload)})));
  }

  @Get('rfq/:id')
  async get(@Req()request:AuthRequest,@Param('id')id:string){const row=await this.ownedRfq(id,requireAuthUser(request).id);return{...row,payload:await this.hydrate(row.payloadJson as unknown as StoredPayload)};}

  @Post('rfq/:id/quotes')
  async addQuote(@Req()request:AuthRequest,@Param('id')id:string,@Body()body:unknown){
    const user=requireAuthUser(request),rfq=await this.ownedRfq(id,user.id),parsed=QuoteSchema.safeParse(body);if(!parsed.success)throw new BadRequestException(parsed.error.flatten());
    if(!['SUBMITTED','RECEIVED'].includes(rfq.status))throw new BadRequestException(`Quote request is ${rfq.status.toLowerCase()} and is not accepting quote responses.`);
    const quote=await this.db.quote.create({data:{quoteRequestId:id,status:'RECEIVED',...parsed.data,responseJson:parsed.data.responseJson as Prisma.InputJsonValue|undefined}});
    await this.db.quoteRequest.update({where:{id},data:{status:'RECEIVED'}});return quote;
  }

  @Patch('rfq/:id/status')
  async status(@Req()request:AuthRequest,@Param('id')id:string,@Body()body:unknown){
    const user=requireAuthUser(request),rfq=await this.ownedRfq(id,user.id),parsed=StatusSchema.safeParse(body);if(!parsed.success)throw new BadRequestException(parsed.error.flatten());
    if(rfq.status!=='RECEIVED')throw new BadRequestException(`Only a received quote request can be accepted or rejected; current status is ${rfq.status}.`);
    return this.db.quoteRequest.update({where:{id},data:{status:parsed.data.status}});
  }
}

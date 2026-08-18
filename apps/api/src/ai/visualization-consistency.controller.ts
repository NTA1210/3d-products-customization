import {BadRequestException,Body,Controller,HttpException,HttpStatus,NotFoundException,Param,Post,Req,UseGuards} from '@nestjs/common';
import {Prisma} from '@prisma/client';
import {z} from 'zod';
import {AuthRequest,requireAuthUser,SupabaseAuthGuard} from '../auth/auth.service';
import {PrismaService} from '../prisma/prisma.service';
import {StorageService} from '../storage/storage.service';
import {AiProviderService,VisualizationConsistencyResponseSchema} from './ai-provider.service';

const RequestSchema=z.object({renderJobId:z.string().min(1),generatedJobId:z.string().min(1)});
type RenderAsset={view?:string;objectKey:string;filename:string};

@Controller('projects/:projectId/ai')
@UseGuards(SupabaseAuthGuard)
export class VisualizationConsistencyController{
  constructor(private readonly db:PrismaService,private readonly provider:AiProviderService,private readonly storage:StorageService){}

  private async enforceQuota(userId:string){
    const since=new Date(Date.now()-60*60*1000),limit=Number(process.env.AI_VISUALIZATION_REVIEWS_PER_HOUR??10);
    const recent=await this.db.aIRequest.count({where:{userId,type:'VISUALIZATION_CONSISTENCY',createdAt:{gte:since}}});
    if(recent>=limit)throw new HttpException(`Visualization review quota exceeded (${limit}/hour).`,HttpStatus.TOO_MANY_REQUESTS);
  }

  @Post('visualization-consistency')
  async review(@Req()request:AuthRequest,@Param('projectId')projectId:string,@Body()body:unknown){
    const user=requireAuthUser(request),parsed=RequestSchema.safeParse(body);if(!parsed.success)throw new BadRequestException(parsed.error.flatten());
    await this.enforceQuota(user.id);
    const[project,render,generated]=await Promise.all([
      this.db.project.findFirst({where:{id:projectId,userId:user.id}}),
      this.db.renderJob.findFirst({where:{id:parsed.data.renderJobId,projectId,userId:user.id},include:{job:true}}),
      this.db.job.findFirst({where:{id:parsed.data.generatedJobId,type:'AI_VISUALIZATION',status:'COMPLETED'}}),
    ]);
    if(!project)throw new NotFoundException('Project not found.');
    if(!render||render.job.status!=='COMPLETED')throw new BadRequestException('A completed current-project render is required.');
    const generatedPayload=(generated?.payload??{}) as Record<string,unknown>,generatedResult=(generated?.result??{}) as Record<string,unknown>;
    if(!generated||generatedPayload.projectId!==projectId||generatedPayload.userId!==user.id||typeof generatedResult.objectKey!=='string')throw new BadRequestException('A completed generated visualization owned by this project is required.');
    const assets=(render.job.result as{assets?:RenderAsset[]}|null)?.assets??[],perspective=assets.find(asset=>asset.view==='perspective')??assets[0];
    if(!perspective)throw new BadRequestException('Render contains no source image for consistency review.');
    const[sourceUrl,generatedUrl]=await Promise.all([this.storage.createDownloadUrl(perspective.objectKey,1800),this.storage.createDownloadUrl(generatedResult.objectKey,1800)]);
    const prompt=`Compare two images of the same customized 3D product. IMAGE 1 is the authoritative product render from the current configuration. IMAGE 2 is a generated lifestyle/visualization image. Ignore background, camera crop, lighting, shadows and decorative environment unless they obscure the product. Score how well IMAGE 2 preserves: (1) primary shape/proportions, (2) visible component structure/count/placement, and (3) material/color identity. Do not reward artistic quality. Return concise observations only for meaningful drift. Scores are 0..1.`;
    const row=await this.db.aIRequest.create({data:{userId:user.id,projectId,type:'VISUALIZATION_CONSISTENCY',provider:process.env.AI_PROVIDER??'disabled',model:process.env.OPENAI_VISUALIZATION_REVIEW_MODEL??process.env.OPENAI_DESIGN_MODEL,status:'PROCESSING',inputJson:{renderJobId:render.id,generatedJobId:generated.id,sourceObjectKey:perspective.objectKey,generatedObjectKey:generatedResult.objectKey} as Prisma.InputJsonValue}});
    try{
      const providerResult=await this.provider.visualizationConsistency({prompt,imageUrls:[sourceUrl,generatedUrl]}),scores=VisualizationConsistencyResponseSchema.parse(providerResult.response);
      const overallScore=scores.shapeScore*.45+scores.componentScore*.35+scores.materialColorScore*.20;
      const status=scores.shapeScore>=.8&&scores.componentScore>=.8&&scores.materialColorScore>=.65&&overallScore>=.78?'PASS':'REVIEW';
      const result={...scores,overallScore,status,thresholds:{shape:.8,component:.8,materialColor:.65,overall:.78},authority:'SOURCE_RENDER'} as const;
      await this.db.aIRequest.update({where:{id:row.id},data:{provider:providerResult.provider,model:providerResult.model,status:'COMPLETED',resultJson:result as unknown as Prisma.InputJsonValue,error:null}});
      return{id:row.id,...result};
    }catch(error){await this.db.aIRequest.update({where:{id:row.id},data:{status:'FAILED',error:error instanceof Error?error.message:String(error)}});throw error;}
  }
}

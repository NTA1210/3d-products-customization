import {BadGatewayException,BadRequestException,Body,Controller,HttpException,HttpStatus,NotFoundException,Param,Post,Req,UseGuards} from '@nestjs/common';
import {Prisma} from '@prisma/client';
import {CollectionProductSchema,rankCollection} from '@product3d/collection-engine';
import {ModelConfigurationSchema,ModelManifestSchema} from '@product3d/model-schema';
import {z} from 'zod';
import {AiProviderService,CollectionExplanationResponseSchema} from '../ai/ai-provider.service';
import {AuthRequest,requireAuthUser,SupabaseAuthGuard} from '../auth/auth.service';
import {PrismaService} from '../prisma/prisma.service';

const RequestSchema=z.object({
  configurationJson:ModelConfigurationSchema,
  category:z.string().trim().min(1).max(80).default('CUSTOM'),
  colorFamily:z.string().trim().min(1).max(80).nullable().optional(),
  styleTags:z.array(z.string().trim().min(1).max(80)).max(30).default([]),
  materialTags:z.array(z.string().trim().min(1).max(80)).max(30).default([]),
  componentFeatures:z.array(z.string().trim().min(1).max(80)).max(50).default([]),
  limit:z.number().int().min(1).max(20).default(6),
});
type RequestData=z.infer<typeof RequestSchema>;

@Controller('projects/:projectId/collection')
@UseGuards(SupabaseAuthGuard)
export class CollectionController{
  constructor(private readonly db:PrismaService,private readonly provider:AiProviderService){}

  private async ranked(userId:string,projectId:string,data:RequestData){
    const project=await this.db.project.findFirst({where:{id:projectId,userId},include:{modelAsset:{include:{manifests:{orderBy:{version:'desc'},take:1}}}}});
    if(!project)throw new NotFoundException('Project not found.');
    const manifestRecord=project.modelAsset.manifests[0];if(!manifestRecord)throw new BadRequestException('Project asset has no manifest.');
    const manifest=ModelManifestSchema.parse(manifestRecord.manifestJson),configuration=data.configurationJson;
    if(configuration.modelId!==manifest.modelId)throw new BadRequestException('Configuration does not match project manifest.');

    const materialIds=[...new Set(Object.values(configuration.components).map(component=>component.materialId).filter((id):id is string=>Boolean(id)))];
    const [materials,style,candidates]=await Promise.all([
      materialIds.length?this.db.materialPreset.findMany({where:{id:{in:materialIds},active:true}}):Promise.resolve([]),
      configuration.appliedStyleId?this.db.stylePreset.findUnique({where:{id:configuration.appliedStyleId}}):Promise.resolve(null),
      this.db.collectionProduct.findMany({where:{active:true}}),
    ]);
    const sourceStyleTags=[...new Set([...data.styleTags,...(style?.styleTags??[]),...(manifest.modelTags??[]),...manifest.components.flatMap(component=>component.styleTags??[])])];
    const derivedMaterialTags=materials.flatMap(material=>[material.category,...material.styleTags]);
    const sourceMaterialTags=[...new Set([...data.materialTags,...derivedMaterialTags])];
    const derivedFeatures=manifest.components.map(component=>component.role).filter(role=>role!=='UNKNOWN');
    const source=CollectionProductSchema.parse({
      id:`project:${projectId}`,name:project.name,category:data.category,styleTags:sourceStyleTags,
      materialTags:sourceMaterialTags,colorFamily:data.colorFamily??null,
      componentFeatures:[...new Set([...data.componentFeatures,...derivedFeatures])],metadata:{projectId},
    });
    const recommendations=rankCollection(source,candidates.map(row=>CollectionProductSchema.parse({...row,metadata:row.metadataJson})),data.limit);
    return{source,weights:{style:.5,material:.25,color:.15,other:.1},recommendations};
  }

  private async enforceExplanationQuota(userId:string){
    const since=new Date(Date.now()-60*60*1000),limit=Number(process.env.AI_COLLECTION_EXPLANATIONS_PER_HOUR??20);
    const recent=await this.db.aIRequest.count({where:{userId,type:'COLLECTION_EXPLANATION',createdAt:{gte:since}}});
    if(recent>=limit)throw new HttpException(`Collection explanation quota exceeded (${limit}/hour).`,HttpStatus.TOO_MANY_REQUESTS);
  }

  @Post('recommendations')
  async recommendations(@Req()request:AuthRequest,@Param('projectId')projectId:string,@Body()body:unknown){
    const parsed=RequestSchema.safeParse(body);if(!parsed.success)throw new BadRequestException(parsed.error.flatten());
    return this.ranked(requireAuthUser(request).id,projectId,parsed.data);
  }

  @Post('recommendations/explain')
  async explain(@Req()request:AuthRequest,@Param('projectId')projectId:string,@Body()body:unknown){
    const user=requireAuthUser(request),parsed=RequestSchema.safeParse(body);if(!parsed.success)throw new BadRequestException(parsed.error.flatten());
    await this.enforceExplanationQuota(user.id);
    const ranked=await this.ranked(user.id,projectId,parsed.data),allowedIds=new Set(ranked.recommendations.map(item=>item.product.id));
    const providerInput={source:ranked.source,weights:ranked.weights,recommendations:ranked.recommendations.map(item=>({product:item.product,score:item.score,breakdown:item.breakdown}))};
    const prompt=`Explain an already-computed deterministic product collection ranking. The ranking, score, order and breakdown are authoritative and MUST NOT be changed. Explain only product IDs in INPUT. Keep each explanation concise and grounded in the supplied style/material/color/other breakdown and product metadata. Do not invent product properties.\n\nINPUT:\n${JSON.stringify(providerInput)}`;
    const row=await this.db.aIRequest.create({data:{userId:user.id,projectId,type:'COLLECTION_EXPLANATION',provider:process.env.AI_PROVIDER??'disabled',model:process.env.OPENAI_COLLECTION_MODEL??process.env.OPENAI_DESIGN_MODEL,status:'PROCESSING',inputJson:providerInput as unknown as Prisma.InputJsonValue}});
    try{
      const providerResult=await this.provider.collectionExplanation({prompt,imageUrls:[]}),result=CollectionExplanationResponseSchema.parse(providerResult.response);
      const unknown=result.explanations.filter(item=>!allowedIds.has(item.productId)).map(item=>item.productId);
      if(unknown.length)throw new BadGatewayException(`AI explained unknown collection product IDs: ${unknown.join(', ')}`);
      const byId=new Map(result.explanations.map(item=>[item.productId,item.explanation]));
      const recommendations=ranked.recommendations.map(item=>({...item,aiExplanation:byId.get(item.product.id)}));
      await this.db.aIRequest.update({where:{id:row.id},data:{provider:providerResult.provider,model:providerResult.model,status:'COMPLETED',resultJson:result as unknown as Prisma.InputJsonValue,error:null}});
      return{...ranked,recommendations,ai:{id:row.id,summary:result.summary,authoritativeRanking:'DETERMINISTIC'}};
    }catch(error){await this.db.aIRequest.update({where:{id:row.id},data:{status:'FAILED',error:error instanceof Error?error.message:String(error)}});throw error;}
  }
}

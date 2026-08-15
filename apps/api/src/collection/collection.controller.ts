import {BadRequestException,Body,Controller,NotFoundException,Param,Post,Req,UseGuards} from '@nestjs/common';
import {CollectionProductSchema,rankCollection} from '@product3d/collection-engine';
import {ModelConfigurationSchema,ModelManifestSchema} from '@product3d/model-schema';
import {z} from 'zod';
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

@Controller('projects/:projectId/collection')
@UseGuards(SupabaseAuthGuard)
export class CollectionController{
  constructor(private readonly db:PrismaService){}

  @Post('recommendations')
  async recommendations(@Req()request:AuthRequest,@Param('projectId')projectId:string,@Body()body:unknown){
    const user=requireAuthUser(request),parsed=RequestSchema.safeParse(body);
    if(!parsed.success)throw new BadRequestException(parsed.error.flatten());
    const project=await this.db.project.findFirst({where:{id:projectId,userId:user.id},include:{modelAsset:{include:{manifests:{orderBy:{version:'desc'},take:1}}}}});
    if(!project)throw new NotFoundException('Project not found.');
    const manifestRecord=project.modelAsset.manifests[0];if(!manifestRecord)throw new BadRequestException('Project asset has no manifest.');
    const manifest=ModelManifestSchema.parse(manifestRecord.manifestJson),configuration=parsed.data.configurationJson;
    if(configuration.modelId!==manifest.modelId)throw new BadRequestException('Configuration does not match project manifest.');

    const materialIds=[...new Set(Object.values(configuration.components).map(component=>component.materialId).filter((id):id is string=>Boolean(id)))];
    const [materials,style,candidates]=await Promise.all([
      materialIds.length?this.db.materialPreset.findMany({where:{id:{in:materialIds},active:true}}):Promise.resolve([]),
      configuration.appliedStyleId?this.db.stylePreset.findUnique({where:{id:configuration.appliedStyleId}}):Promise.resolve(null),
      this.db.collectionProduct.findMany({where:{active:true}}),
    ]);
    const sourceStyleTags=[...new Set([...parsed.data.styleTags,...(style?.styleTags??[])])];
    const derivedMaterialTags=materials.flatMap(material=>[material.category,...material.styleTags]);
    const sourceMaterialTags=[...new Set([...parsed.data.materialTags,...derivedMaterialTags])];
    const derivedFeatures=manifest.components.map(component=>component.role).filter(role=>role!=='UNKNOWN');
    const source=CollectionProductSchema.parse({
      id:`project:${projectId}`,name:project.name,category:parsed.data.category,styleTags:sourceStyleTags,
      materialTags:sourceMaterialTags,colorFamily:parsed.data.colorFamily??null,
      componentFeatures:[...new Set([...parsed.data.componentFeatures,...derivedFeatures])],metadata:{projectId},
    });
    const ranked=rankCollection(source,candidates.map(row=>CollectionProductSchema.parse({...row,metadata:row.metadataJson})),parsed.data.limit);
    return{source,weights:{style:.5,material:.25,color:.15,other:.1},recommendations:ranked};
  }
}

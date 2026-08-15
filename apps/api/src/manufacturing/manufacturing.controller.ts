import {BadRequestException,Body,Controller,Get,NotFoundException,Param,Post,Req,UseGuards} from '@nestjs/common';
import {Prisma} from '@prisma/client';
import {ManufacturingRuleDefinitionSchema,runManufacturingRules,type ManufacturingRule} from '@product3d/manufacturing-engine';
import {ModelConfigurationSchema,ModelManifestSchema} from '@product3d/model-schema';
import {AuthRequest,requireAuthUser,SupabaseAuthGuard} from '../auth/auth.service';
import {PrismaService} from '../prisma/prisma.service';

@Controller('projects/:projectId/manufacturability')
@UseGuards(SupabaseAuthGuard)
export class ManufacturingController{
  constructor(private readonly db:PrismaService){}

  @Post('check')
  async check(@Req()request:AuthRequest,@Param('projectId')projectId:string,@Body()body:{configurationJson:unknown;modelVersionId?:string}){
    const user=requireAuthUser(request);
    const configuration=ModelConfigurationSchema.safeParse(body.configurationJson);
    if(!configuration.success)throw new BadRequestException(configuration.error.flatten());
    const project=await this.db.project.findFirst({where:{id:projectId,userId:user.id},include:{modelAsset:{include:{manifests:{orderBy:{version:'desc'},take:1}}}}});
    if(!project)throw new NotFoundException('Project not found.');
    if(body.modelVersionId){const version=await this.db.modelVersion.findFirst({where:{id:body.modelVersionId,projectId}});if(!version)throw new BadRequestException('modelVersionId does not belong to this project.');}
    const manifestRecord=project.modelAsset.manifests[0];
    if(!manifestRecord)throw new BadRequestException('Project asset has no saved manifest.');
    const manifest=ModelManifestSchema.parse(manifestRecord.manifestJson);
    if(configuration.data.modelId!==manifest.modelId)throw new BadRequestException('Configuration does not match project manifest.');

    const [ruleRows,materials]=await Promise.all([this.db.manufacturingRule.findMany({where:{active:true}}),this.db.materialPreset.findMany({where:{active:true},select:{id:true,category:true}})]);
    const rules:ManufacturingRule[]=ruleRows.map(row=>({id:row.id,name:row.name,severity:row.severity as ManufacturingRule['severity'],definition:ManufacturingRuleDefinitionSchema.parse(row.ruleJson)}));
    const issues=runManufacturingRules({manifest,configuration:configuration.data,rules,materials});
    const check=await this.db.manufacturingCheck.create({data:{userId:user.id,projectId,modelVersionId:body.modelVersionId,configurationJson:configuration.data as Prisma.InputJsonValue,issuesJson:issues as unknown as Prisma.InputJsonValue,status:'COMPLETED'}});
    return{id:check.id,status:check.status,issues};
  }

  @Get('checks/:checkId')
  async get(@Req()request:AuthRequest,@Param('projectId')projectId:string,@Param('checkId')checkId:string){
    const row=await this.db.manufacturingCheck.findFirst({where:{id:checkId,projectId,userId:requireAuthUser(request).id}});
    if(!row)throw new NotFoundException('Manufacturing check not found.');
    return row;
  }
}

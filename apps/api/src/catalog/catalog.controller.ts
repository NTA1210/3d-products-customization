import {BadRequestException,Body,Controller,Delete,Get,NotFoundException,Param,Post,Query} from '@nestjs/common';
import {PresetRuleSetSchema} from '@product3d/preset-engine';
import {Prisma} from '@prisma/client';
import {PrismaService} from '../prisma/prisma.service';import {StorageService} from '../storage/storage.service';
function objectKey(uri:string){const match=/^supabase:\/\/[^/]+\/(.+)$/.exec(uri);return match?.[1];}
@Controller()
export class CatalogController{constructor(private readonly db:PrismaService,private readonly storage:StorageService){}
 @Get('variants') async variants(@Query('groupId')groupId?:string,@Query('role')role?:string){const rows=await this.db.componentVariant.findMany({where:{active:true,groupId:groupId||undefined,role:role||undefined}});return Promise.all(rows.map(async row=>{const metadata=row.metadataJson as Record<string,unknown>;const key=objectKey(row.assetUrl);return{id:row.id,groupId:row.groupId,name:row.name,role:row.role,assetUrl:row.assetUrl,signedUrl:key?await this.storage.createDownloadUrl(key,900):row.assetUrl,anchorType:typeof metadata.anchorType==='string'?metadata.anchorType:'BOUNDS_CENTER',dimensionPolicy:metadata.dimensionPolicy==='KEEP'||metadata.dimensionPolicy==='RULE_BASED'?metadata.dimensionPolicy:'AUTO_FIT',compatibleModelTags:[],compatibleComponentRoles:[row.role],metadata};}));}
 @Get('styles') styles(){return this.db.stylePreset.findMany({where:{active:true},orderBy:{name:'asc'}});}
 @Get('presets') presets(@Query('userId')userId:string){if(!userId)throw new BadRequestException('userId is required.');return this.db.userPreset.findMany({where:{userId},orderBy:{updatedAt:'desc'}});}
 @Post('presets') async savePreset(@Body()body:{userId:string;name:string;rulesJson:unknown}){const rules=PresetRuleSetSchema.safeParse(body.rulesJson);if(!rules.success)throw new BadRequestException(rules.error.flatten());const user=await this.db.user.findUnique({where:{id:body.userId}});if(!user)throw new NotFoundException('User not found.');return this.db.userPreset.create({data:{userId:body.userId,name:body.name,rulesJson:rules.data as Prisma.InputJsonValue}});}
 @Delete('presets/:id') async removePreset(@Param('id')id:string,@Query('userId')userId:string){const row=await this.db.userPreset.findFirst({where:{id,userId}});if(!row)throw new NotFoundException('Preset not found.');await this.db.userPreset.delete({where:{id}});return{deleted:true};}
}

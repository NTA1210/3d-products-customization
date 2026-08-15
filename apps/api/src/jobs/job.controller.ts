import {Controller,Get,NotFoundException,Param,Req,UseGuards} from '@nestjs/common';import {AuthRequest,requireAuthUser,SupabaseAuthGuard} from '../auth/auth.service';import {PrismaService} from '../prisma/prisma.service';import {StorageService} from '../storage/storage.service';
@Controller('jobs') @UseGuards(SupabaseAuthGuard)
export class JobController{constructor(private readonly db:PrismaService,private readonly storage:StorageService){}
 private async owned(id:string,userId:string){const job=await this.db.job.findFirst({where:{id,modelAsset:{ownerId:userId}}});if(!job)throw new NotFoundException('Job not found.');return job}
 @Get(':id') get(@Req()r:AuthRequest,@Param('id')id:string){return this.owned(id,requireAuthUser(r).id)}
 @Get(':id/artifact') async artifact(@Req()r:AuthRequest,@Param('id')id:string){const job=await this.owned(id,requireAuthUser(r).id),result=job.result as Record<string,unknown>|null,objectKey=typeof result?.objectKey==='string'?result.objectKey:undefined;if(!objectKey)throw new NotFoundException('Job does not have a downloadable artifact.');return{url:await this.storage.createDownloadUrl(objectKey),expiresInSeconds:900,filename:typeof result?.filename==='string'?result.filename:undefined}}
}

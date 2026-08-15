import {Controller,Get,NotFoundException,Param} from '@nestjs/common';
import {PrismaService} from '../prisma/prisma.service';
import {StorageService} from '../storage/storage.service';
@Controller('jobs')
export class JobController{
  constructor(private readonly db:PrismaService,private readonly storage:StorageService){}
  @Get(':id') async get(@Param('id')id:string){const job=await this.db.job.findUnique({where:{id}});if(!job)throw new NotFoundException('Job not found.');return job;}
  @Get(':id/artifact') async artifact(@Param('id')id:string){const job=await this.db.job.findUnique({where:{id}});if(!job)throw new NotFoundException('Job not found.');const result=job.result as Record<string,unknown>|null;const objectKey=typeof result?.objectKey==='string'?result.objectKey:undefined;if(!objectKey)throw new NotFoundException('Job does not have a downloadable artifact.');return{url:await this.storage.createDownloadUrl(objectKey),expiresInSeconds:900,filename:typeof result?.filename==='string'?result.filename:undefined};}
}

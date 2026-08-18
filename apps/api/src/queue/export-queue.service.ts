import {Injectable,OnModuleDestroy} from '@nestjs/common';
import type {ModelConfiguration,ModelManifest} from '@product3d/model-schema';
import {Queue} from 'bullmq';
import {redisConnectionFromEnv} from '../config';

export const EXPORT_PROCESSING_QUEUE='export-processing';
export type ExportFormat='GLB'|'GLTF'|'FBX'|'USDZ'|'OBJ'|'STL';
export type ExportJobData={databaseJobId:string;projectId:string;assetId:string;sourceObjectKey:string;manifest:ModelManifest;configuration:ModelConfiguration;filename:string;format:ExportFormat};
@Injectable()
export class ExportQueueService implements OnModuleDestroy{
  private readonly queue=new Queue<ExportJobData>(EXPORT_PROCESSING_QUEUE,{connection:redisConnectionFromEnv(false),defaultJobOptions:{attempts:2,backoff:{type:'exponential',delay:2000},removeOnComplete:100,removeOnFail:100}});
  enqueue(data:ExportJobData){return this.queue.add('export-model',data,{jobId:data.databaseJobId});}
  async onModuleDestroy(){await this.queue.close();}
}

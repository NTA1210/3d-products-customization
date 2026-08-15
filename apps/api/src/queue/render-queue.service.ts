import {Injectable,OnModuleDestroy} from '@nestjs/common';
import {Queue} from 'bullmq';
import {redisConnectionFromEnv} from '../config';

export const RENDER_PROCESSING_QUEUE='render-processing';
export type RenderMode='MULTI_VIEW'|'SPIN_360';
export type RenderQuality='DRAFT'|'STANDARD'|'HIGH';
export type RenderJobData={
  databaseJobId:string;
  renderJobId:string;
  projectId:string;
  userId:string;
  sourceObjectKey:string;
  mode:RenderMode;
  quality:RenderQuality;
  frameCount:number;
};

@Injectable()
export class RenderQueueService implements OnModuleDestroy{
  private readonly queue=new Queue<RenderJobData>(RENDER_PROCESSING_QUEUE,{
    connection:redisConnectionFromEnv(false),
    defaultJobOptions:{attempts:2,backoff:{type:'exponential',delay:3000},removeOnComplete:100,removeOnFail:100},
  });
  enqueue(data:RenderJobData){return this.queue.add('render-product',data,{jobId:data.databaseJobId});}
  async onModuleDestroy(){await this.queue.close();}
}

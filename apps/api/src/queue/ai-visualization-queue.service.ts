import {Injectable,OnModuleDestroy} from '@nestjs/common';
import {Queue} from 'bullmq';
import {redisConnectionFromEnv} from '../config';

export const AI_VISUALIZATION_QUEUE='ai-visualization';
export type AiVisualizationJobData={databaseJobId:string;aiRequestId:string;projectId:string;userId:string;inputObjectKey:string;prompt:string};
@Injectable()
export class AiVisualizationQueueService implements OnModuleDestroy{
  private readonly queue=new Queue<AiVisualizationJobData>(AI_VISUALIZATION_QUEUE,{connection:redisConnectionFromEnv(false),defaultJobOptions:{attempts:2,backoff:{type:'exponential',delay:5000},removeOnComplete:100,removeOnFail:100}});
  enqueue(data:AiVisualizationJobData){return this.queue.add('generate-lifestyle-image',data,{jobId:data.databaseJobId});}
  async onModuleDestroy(){await this.queue.close();}
}

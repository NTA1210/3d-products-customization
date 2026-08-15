import {Injectable,OnModuleDestroy} from '@nestjs/common';
import {Queue} from 'bullmq';
import {redisConnectionFromEnv} from '../config';

export const GEOMETRY_ANALYSIS_QUEUE='geometry-analysis';
export type GeometryJobData={
  databaseJobId:string;
  manufacturingCheckId:string;
  projectId:string;
  userId:string;
  sourceObjectKey:string;
};

@Injectable()
export class GeometryQueueService implements OnModuleDestroy{
  private readonly queue=new Queue<GeometryJobData>(GEOMETRY_ANALYSIS_QUEUE,{connection:redisConnectionFromEnv(false),defaultJobOptions:{attempts:2,backoff:{type:'exponential',delay:3000},removeOnComplete:100,removeOnFail:100}});
  enqueue(data:GeometryJobData){return this.queue.add('analyze-geometry',data,{jobId:data.databaseJobId});}
  async onModuleDestroy(){await this.queue.close();}
}

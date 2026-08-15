import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';
import { redisConnectionFromEnv } from '../config';

export const ASSET_PROCESSING_QUEUE = 'asset-processing';

export type AssetProcessingJobData = {
  assetId: string;
  databaseJobId: string;
  sourceObjectKey: string;
  originalFilename: string;
};

@Injectable()
export class AssetQueueService implements OnModuleDestroy {
  private readonly queue = new Queue<AssetProcessingJobData>(ASSET_PROCESSING_QUEUE, {
    connection: redisConnectionFromEnv(false),
    defaultJobOptions: {
      attempts: 2,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: 100,
      removeOnFail: 100,
    },
  });

  async enqueue(data: AssetProcessingJobData) {
    return this.queue.add('validate-normalize', data, { jobId: data.databaseJobId });
  }

  async onModuleDestroy() {
    await this.queue.close();
  }
}

import { Injectable } from '@nestjs/common';
import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { requiredEnv } from '../config';

function buildClient(endpoint: string | undefined) {
  const accessKeyId = process.env.S3_ACCESS_KEY;
  const secretAccessKey = process.env.S3_SECRET_KEY;
  return new S3Client({
    region: requiredEnv('S3_REGION', 'us-east-1'),
    endpoint,
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE ? process.env.S3_FORCE_PATH_STYLE === 'true' : Boolean(endpoint),
    credentials: accessKeyId && secretAccessKey ? { accessKeyId, secretAccessKey } : undefined,
  });
}

@Injectable()
export class StorageService {
  private readonly bucket = requiredEnv('S3_BUCKET', 'product3d');
  private readonly internalClient = buildClient(process.env.S3_ENDPOINT);
  private readonly publicClient = buildClient(process.env.S3_PUBLIC_ENDPOINT ?? process.env.S3_ENDPOINT);

  async createUploadUrl(key: string, contentType: string, expiresInSeconds = 900) {
    const command = new PutObjectCommand({ Bucket: this.bucket, Key: key, ContentType: contentType });
    return getSignedUrl(this.publicClient, command, {
      expiresIn: expiresInSeconds,
      signableHeaders: new Set(['content-type']),
    });
  }

  async createDownloadUrl(key: string, expiresInSeconds = 900) {
    return getSignedUrl(this.publicClient, new GetObjectCommand({ Bucket: this.bucket, Key: key }), {
      expiresIn: expiresInSeconds,
    });
  }

  async assertObjectExists(key: string) {
    await this.internalClient.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  objectUri(key: string) {
    return `s3://${this.bucket}/${key}`;
  }
}

import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune } from '@gltf-transform/functions';
import { Prisma, PrismaClient } from '@prisma/client';
import { createClient } from '@supabase/supabase-js';
import { Job as BullJob, Worker } from 'bullmq';
import * as draco3d from 'draco3dgltf';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import validator from 'gltf-validator';

const QUEUE_NAME = 'asset-processing';
const prisma = new PrismaClient();

type AssetProcessingJobData = {
  assetId: string;
  databaseJobId: string;
  sourceObjectKey: string;
  originalFilename: string;
};

function requiredEnv(name: string, fallback?: string) {
  const value = process.env[name] ?? fallback;
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function redisConnection() {
  const url = new URL(process.env.REDIS_URL ?? 'redis://localhost:6379');
  const dbPath = url.pathname.replace(/^\//, '');
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    username: url.username ? decodeURIComponent(url.username) : undefined,
    password: url.password ? decodeURIComponent(url.password) : undefined,
    db: dbPath ? Number(dbPath) : 0,
    tls: url.protocol === 'rediss:' ? {} : undefined,
    maxRetriesPerRequest: null,
  };
}

const storage = createClient(
  requiredEnv('SUPABASE_URL'),
  requiredEnv('SUPABASE_SERVICE_ROLE_KEY'),
  { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } },
);
const bucket = requiredEnv('SUPABASE_STORAGE_BUCKET', 'product3d-assets');

async function downloadObject(key: string) {
  const { data, error } = await storage.storage.from(bucket).download(key);
  if (error) throw error;
  return new Uint8Array(await data.arrayBuffer());
}

async function uploadObject(key: string, bytes: Uint8Array) {
  const { error } = await storage.storage.from(bucket).upload(key, bytes, {
    contentType: 'model/gltf-binary',
    cacheControl: '3600',
    upsert: false,
  });
  if (error) throw error;
}

async function validateGlb(bytes: Uint8Array, uri: string) {
  const report = await validator.validateBytes(bytes, { uri, format: 'glb', maxIssues: 5000 });
  if (report.issues.numErrors > 0) {
    throw new Error(`glTF validation failed with ${report.issues.numErrors} error(s).`);
  }
  return report;
}

async function createNodeIo() {
  await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready]);
  const [decoder, encoder] = await Promise.all([
    draco3d.createDecoderModule(),
    draco3d.createEncoderModule(),
  ]);
  return new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({
      'draco3d.decoder': decoder,
      'draco3d.encoder': encoder,
      'meshopt.decoder': MeshoptDecoder,
      'meshopt.encoder': MeshoptEncoder,
    });
}

async function normalize(bytes: Uint8Array) {
  const directory = await mkdtemp(join(tmpdir(), 'product3d-asset-'));
  const sourcePath = join(directory, 'source.glb');
  try {
    await writeFile(sourcePath, bytes);
    const io = await createNodeIo();
    const document = await io.read(sourcePath);
    const root = document.getRoot();
    const statsBefore = {
      scenes: root.listScenes().length,
      nodes: root.listNodes().length,
      meshes: root.listMeshes().length,
      materials: root.listMaterials().length,
      textures: root.listTextures().length,
    };
    await document.transform(prune(), dedup());
    const normalized = await io.writeBinary(document);
    const normalizedRoot = document.getRoot();
    return {
      normalized,
      statsBefore,
      statsAfter: {
        scenes: normalizedRoot.listScenes().length,
        nodes: normalizedRoot.listNodes().length,
        meshes: normalizedRoot.listMeshes().length,
        materials: normalizedRoot.listMaterials().length,
        textures: normalizedRoot.listTextures().length,
      },
    };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function processAsset(job: BullJob<AssetProcessingJobData>) {
  const { assetId, databaseJobId, sourceObjectKey, originalFilename } = job.data;
  await prisma.$transaction([
    prisma.job.update({ where: { id: databaseJobId }, data: { status: 'PROCESSING', failureReason: null } }),
    prisma.modelAsset.update({ where: { id: assetId }, data: { status: 'PROCESSING' } }),
  ]);

  try {
    const sourceBytes = await downloadObject(sourceObjectKey);
    const sourceReport = await validateGlb(sourceBytes, originalFilename);
    const { normalized, statsBefore, statsAfter } = await normalize(sourceBytes);
    const normalizedReport = await validateGlb(normalized, 'normalized.glb');
    const normalizedObjectKey = `assets/${assetId}/normalized/model.glb`;
    await uploadObject(normalizedObjectKey, normalized);

    const result: Prisma.InputJsonObject = {
      normalizedObjectKey,
      sourceValidation: {
        errors: sourceReport.issues.numErrors,
        warnings: sourceReport.issues.numWarnings,
        infos: sourceReport.issues.numInfos,
        hints: sourceReport.issues.numHints,
      },
      normalizedValidation: {
        errors: normalizedReport.issues.numErrors,
        warnings: normalizedReport.issues.numWarnings,
        infos: normalizedReport.issues.numInfos,
        hints: normalizedReport.issues.numHints,
      },
      statsBefore,
      statsAfter,
    };

    await prisma.$transaction([
      prisma.modelAsset.update({
        where: { id: assetId },
        data: {
          status: 'READY',
          normalizedObjectKey,
          normalizedGlbUrl: `supabase://${bucket}/${normalizedObjectKey}`,
          validationJson: sourceReport as unknown as Prisma.InputJsonValue,
        },
      }),
      prisma.job.update({
        where: { id: databaseJobId },
        data: { status: 'COMPLETED', result, failureReason: null },
      }),
    ]);

    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const maxAttempts = job.opts.attempts ?? 1;
    const willRetry = job.attemptsMade + 1 < maxAttempts;
    await prisma.$transaction([
      prisma.job.update({
        where: { id: databaseJobId },
        data: { status: willRetry ? 'RETRYING' : 'FAILED', failureReason: message },
      }),
      prisma.modelAsset.update({
        where: { id: assetId },
        data: { status: willRetry ? 'QUEUED' : 'FAILED' },
      }),
    ]);
    throw error;
  }
}

const worker = new Worker<AssetProcessingJobData>(QUEUE_NAME, processAsset, {
  connection: redisConnection(),
  concurrency: Number(process.env.ASSET_WORKER_CONCURRENCY ?? 2),
});

worker.on('completed', (job) => {
  console.info(`[asset-worker] completed ${job.id}`);
});

worker.on('failed', (job, error) => {
  console.error(`[asset-worker] failed ${job?.id ?? 'unknown'}: ${error.message}`);
});

async function shutdown(signal: string) {
  console.info(`[asset-worker] ${signal}: shutting down`);
  await worker.close();
  await prisma.$disconnect();
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

console.info(`[asset-worker] listening on queue ${QUEUE_NAME}`);

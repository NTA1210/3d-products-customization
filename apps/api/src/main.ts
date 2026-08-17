import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './module';

const API_JSON_BODY_LIMIT = process.env.API_JSON_BODY_LIMIT ?? '5mb';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Express defaults JSON request bodies to 100kb. A persisted model Manifest can
  // legitimately exceed that once component geometry anchors and semantic metadata
  // are included, so keep a bounded but configurable application-level limit.
  app.useBodyParser('json', { limit: API_JSON_BODY_LIMIT });

  app.setGlobalPrefix('api');
  app.enableCors({ origin: true, credentials: true });
  await app.listen(process.env.PORT ?? 4000);
}

void bootstrap();

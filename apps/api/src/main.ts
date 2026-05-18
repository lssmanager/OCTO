// OCTO Control Plane — NestJS API
import { NestFactory } from '@nestjs/core';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import { loadApiConfig } from '@octo/config';
import { bootstrapTelemetry, createLogger } from '@octo/observability';
import { AppModule } from './app.module';
import { BULLBOARD_BASEPATH, FastifyBullBoardPlugin } from './admin/bullboard.plugin';

const config = loadApiConfig();

bootstrapTelemetry({
  serviceName: 'api',
  serviceVersion: config.BUILD_VERSION,
  otlpEndpoint: process.env['OTEL_EXPORTER_OTLP_ENDPOINT'] ?? 'http://otel-collector:4318/v1/traces',
  enablePrometheus: true,
  prometheusPort: 9464,
});

const logger = createLogger({
  service: 'api',
  version: config.BUILD_VERSION,
});

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ logger: false }),
  );

  app.enableCors({
    origin: config.CORS_ORIGINS.split(',').map((o) => o.trim()),
    credentials: true,
  });

  app.setGlobalPrefix('api');

  // Initialise NestJS DI graph before registering Fastify plugins
  await app.init();

  // Register BullBoard UI on raw Fastify instance
  // Must run after app.init() (DI ready) and before app.listen()
  await FastifyBullBoardPlugin.register(app);

  await app.listen(config.PORT, '0.0.0.0');

  logger.info({
    event: 'api_started',
    trace_id: 'bootstrap',
    run_id: 'bootstrap',
    msg: 'OCTO Control Plane started',
    port: config.PORT,
    env: config.NODE_ENV,
    version: config.BUILD_VERSION,
    phase: config.BUILD_PHASE,
    commit: config.BUILD_COMMIT,
    bullboard_ui: BULLBOARD_BASEPATH,
  });
}

void bootstrap();

// OCTO Control Plane — NestJS API
import { RequestMethod } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import { loadApiConfig } from '@octo/config';
import { bootstrapTelemetry, createLogger } from '@octo/observability';
import { AppModule } from './app.module';
import { BULLBOARD_BASEPATH, FastifyBullBoardPlugin } from './admin/bullboard.plugin';
import { HealthService } from './health/health.service';

const config = loadApiConfig();

bootstrapTelemetry({
  serviceName: 'api',
  serviceVersion: config.BUILD_VERSION,
  otlpEndpoint:
    process.env['OTEL_EXPORTER_OTLP_ENDPOINT'] ?? 'http://otel-collector:4318/v1/traces',
  enablePrometheus: true,
  prometheusPort: 9464,
});

const logger = createLogger({
  service: 'api',
  version: config.BUILD_VERSION,
});

// ── F4: Graceful shutdown on SIGTERM / SIGINT ─────────────────────────

let app: NestFastifyApplication | null = null;

function setupShutdown(): void {
  const shutdown = async (signal: string) => {
    logger.info({
      event: 'shutdown_signal_received',
      trace_id: 'shutdown',
      run_id: 'shutdown',
      msg: `Received ${signal} — starting graceful shutdown`,
      signal,
    });

    if (app) {
      try {
        await app.close();
        logger.info({
          event: 'shutdown_complete',
          trace_id: 'shutdown',
          run_id: 'shutdown',
          msg: 'NestJS application closed gracefully',
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.error({
          event: 'shutdown_error',
          trace_id: 'shutdown',
          run_id: 'shutdown',
          msg: `Error during NestJS close: ${message}`,
          error: message,
        });
        process.exit(1);
      }
    }

    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

async function bootstrap(): Promise<void> {
  app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ logger: false })
  );

  app.enableCors({
    origin: config.CORS_ORIGINS.split(',').map((o) => o.trim()),
    credentials: true,
  });

  app.setGlobalPrefix('api', {
    exclude: [{ path: '', method: RequestMethod.GET }],
  });

  // Initialise NestJS DI graph before registering Fastify plugins
  await app.init();

  // Register BullBoard UI on raw Fastify instance
  // Must run after app.init() (DI ready) and before app.listen()
  await FastifyBullBoardPlugin.register(app);

  // Register graceful shutdown handlers BEFORE listening
  setupShutdown();

  await app.listen(config.PORT, '0.0.0.0');

  // Mark bootstrap complete — /api/health/start now returns 200
  const healthService = app.get(HealthService);
  healthService.markBootstrapped();

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

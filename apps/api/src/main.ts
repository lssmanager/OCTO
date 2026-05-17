// OCTO Control Plane — NestJS API
//
// Responsibilities (Architecture Principle #1):
//   Orchestration, scheduling, state management, approvals, policies,
//   graph persistence, execution coordination, governance, topology management.
//
// FORBIDDEN HERE:
//   Runtime AI execution, tool execution, LLM interaction, reasoning, planning.

import { NestFactory } from '@nestjs/core';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import { loadApiConfig } from '@octo/config';
import { AppModule } from './app.module';

// Validate env BEFORE NestJS bootstrap.
// Process exits immediately with descriptive errors if any variable is invalid.
// This ensures Coolify healthchecks never see a half-booted service.
const config = loadApiConfig();

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({
      logger: config.NODE_ENV !== 'production',
    }),
  );

  app.enableCors({
    origin: config.CORS_ORIGINS.split(',').map((o) => o.trim()),
    credentials: true,
  });

  app.setGlobalPrefix('api');

  await app.listen(config.PORT, '0.0.0.0');

  console.log(
    `\n\u2705 OCTO Control Plane started`,
    `\n   Port:    ${config.PORT}`,
    `\n   Env:     ${config.NODE_ENV}`,
    `\n   Version: ${config.BUILD_VERSION} (${config.BUILD_PHASE})`,
    `\n   Commit:  ${config.BUILD_COMMIT}\n`,
  );
}

void bootstrap();

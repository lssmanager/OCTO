// OCTO Control Plane — NestJS API
// This process handles: orchestration, scheduling, state management, approvals,
// policies, graph persistence, execution coordination, governance, topology.
// FORBIDDEN here: runtime AI execution, tool execution, LLM interaction, reasoning.

import { NestFactory } from '@nestjs/core';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ logger: true })
  );

  app.enableCors({
    origin: process.env['CORS_ORIGINS']?.split(',') ?? ['http://localhost:3000'],
    credentials: true,
  });

  const port = parseInt(process.env['API_PORT'] ?? '3001', 10);
  await app.listen(port, '0.0.0.0');
  console.log(`OCTO Control Plane running on port ${port}`);
}

void bootstrap();

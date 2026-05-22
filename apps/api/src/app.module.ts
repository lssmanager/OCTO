// apps/api/src/app.module.ts
//
// PATCH 5: loadApiConfig() promoted to DI-managed singleton via useFactory.
//
// F0 Security — canonical APP_GUARD pattern:
// InternalSecretGuard is declared as a provider HERE in the root module.
// APP_GUARD uses useExisting to reuse that same DI-managed instance.
// This guarantees NestJS injects the correct root-scope Reflector into
// the guard constructor — resolving the 'getAllAndOverride undefined' crash.
//
// SecurityModule only re-exports the @Public() decorator and the guard type.
// It does NOT declare the guard as a provider or register APP_GUARD.
import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { loadApiConfig } from '@octo/config';
import { SecurityModule, InternalSecretGuard } from '@octo/security';
import { BullBoardModule } from './admin/bullboard.module';
import { HealthModule } from './health/health.module';
import { OpsModule } from './ops/ops.module';
import { MetricsController } from './metrics.controller';

/** Injection token for the API config object. */
export const CONFIG_TOKEN = Symbol('CONFIG_TOKEN');

@Module({
  imports: [SecurityModule, HealthModule, OpsModule, BullBoardModule],
  controllers: [MetricsController],
  providers: [
    {
      provide: CONFIG_TOKEN,
      useFactory: loadApiConfig,
    },
    // Guard provider in root scope — NestJS injects the correct Reflector
    InternalSecretGuard,
    {
      provide: APP_GUARD,
      useExisting: InternalSecretGuard,
    },
  ],
})
export class AppModule {}

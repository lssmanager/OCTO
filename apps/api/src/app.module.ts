// apps/api/src/app.module.ts
//
// F0 Security — canonical APP_GUARD pattern with single class identity:
//
// InternalSecretGuard is declared as a provider HERE in the root module
// and imported from the LOCAL file (not from @octo/security).
// APP_GUARD uses useExisting to reuse that same DI-managed instance.
//
// This guarantees NestJS injects the correct root-scope Reflector because:
// 1. The class registered as provider and the class used by APP_GUARD
//    are the exact same identity (same file, no pnpm store indirection).
// 2. APP_GUARD is in the root module scope where Reflector lives.
import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { loadApiConfig } from '@octo/config';
import { SecurityModule } from '@octo/security';
import { InternalSecretGuard } from './admin/internal-secret.guard';
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
    // Guard declared in root scope — same class identity as APP_GUARD below.
    // Imported from local file, not from @octo/security pnpm store.
    InternalSecretGuard,
    {
      provide: APP_GUARD,
      useExisting: InternalSecretGuard,
    },
  ],
})
export class AppModule {}

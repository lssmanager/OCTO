// apps/api/src/app.module.ts
//
// PATCH 5: loadApiConfig() promoted to DI-managed singleton via useFactory.
//
// F0 Security: APP_GUARD registered directly in AppModule with the
// local InternalSecretGuard class from apps/api/src/admin/ — single
// class identity, no pnpm store virtual module, no dual-resolution bug.
// SecurityModule from @octo/security is kept as a no-op shell for F1+.
//
// The guard class lives in apps/api (not @octo/security) because:
//   - pnpm's virtual store creates a second compiled copy of the package
//   - NestJS resolves APP_GUARD against the store's class identity
//   - That identity differs from the one registered as provider
//   - Result: constructor-injected Reflector is undefined
//
// PATCH 8: Remove inert exports: ['CONFIG']. No internal consumer
// injected this token. CONFIG_TOKEN is exported as a TypeScript symbol
// for future @Inject(CONFIG_TOKEN) usage once consumers exist.
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
    InternalSecretGuard,
    {
      provide: APP_GUARD,
      useExisting: InternalSecretGuard,
    },
  ],
})
export class AppModule {}

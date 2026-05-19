// apps/api/src/app.module.ts
//
// PATCH 5: loadApiConfig() promoted to DI-managed singleton via useFactory.
// The previous module-scope call (const config = loadApiConfig()) ran
// twice — once here and once in main.ts — duplicating env parsing and
// validation side-effects. useFactory is lazy and NestJS-singleton.
//
// main.ts retains its own loadApiConfig() call because it needs port,
// CORS origins, telemetry config, and version metadata BEFORE the NestJS
// container is instantiated. That is architecturally correct — bootstrap
// pre-DI config is not the same concern as runtime DI-managed config.
//
// PATCH 8: Remove inert exports: ['CONFIG']. No internal consumer
// injected this token. CONFIG_TOKEN is exported as a TypeScript symbol
// for future @Inject(CONFIG_TOKEN) usage once consumers exist.
import { Module } from '@nestjs/common';
import { loadApiConfig } from '@octo/config';
import { BullBoardModule } from './admin/bullboard.module';
import { HealthModule } from './health/health.module';
import { OpsModule } from './ops/ops.module';
import { MetricsController } from './metrics.controller';

/** Injection token for the API config object. */
export const CONFIG_TOKEN = Symbol('CONFIG_TOKEN');

@Module({
  imports: [HealthModule, OpsModule, BullBoardModule],
  controllers: [MetricsController],
  providers: [
    {
      // PATCH 5: useFactory — lazy, singleton, DI-managed.
      // Replaces module-scope const config = loadApiConfig().
      provide: CONFIG_TOKEN,
      useFactory: loadApiConfig,
    },
  ],
  // PATCH 8: exports removed — no consumer uses CONFIG_TOKEN yet.
  // Re-add `exports: [CONFIG_TOKEN]` when a module injects it.
})
export class AppModule {}

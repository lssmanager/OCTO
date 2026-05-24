import { Module } from '@nestjs/common';
import { JwksController } from './jwks.controller';
import { JwtKeyStoreService } from './jwt-key-store.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { TenantScopeGuard } from './guards/tenant-scope.guard';
import { RbacGuard } from './guards/rbac.guard';
import { ServiceAuthGuard } from './guards/service-auth.guard';

@Module({
  controllers: [JwksController],
  providers: [JwtKeyStoreService, JwtAuthGuard, TenantScopeGuard, RbacGuard, ServiceAuthGuard],
  exports: [JwtKeyStoreService, JwtAuthGuard, TenantScopeGuard, RbacGuard, ServiceAuthGuard],
})
export class JwtAuthModule {}

import { Module } from '@nestjs/common';
import { JwksController } from './jwks.controller';
import { JwtKeyStoreService } from './jwt-key-store.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { TenantScopeGuard } from './guards/tenant-scope.guard';
import { RbacGuard } from './guards/rbac.guard';
import { ServiceAuthGuard } from './guards/service-auth.guard';
import { HierarchyAccessGuard } from './guards/hierarchy-access.guard';
import { HierarchyAccessService } from './hierarchy-access.service';

@Module({
  controllers: [JwksController],
  providers: [JwtKeyStoreService, JwtAuthGuard, TenantScopeGuard, RbacGuard, ServiceAuthGuard, HierarchyAccessGuard, HierarchyAccessService],
  exports: [JwtKeyStoreService, JwtAuthGuard, TenantScopeGuard, RbacGuard, ServiceAuthGuard, HierarchyAccessGuard, HierarchyAccessService],
})
export class JwtAuthModule {}

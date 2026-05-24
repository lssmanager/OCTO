import { Injectable } from '@nestjs/common';

@Injectable()
export class TenantAwareDbService {
  constructor(private readonly db: { transaction: (fn: (tx: { execute: (query: unknown) => Promise<unknown> }) => Promise<unknown>) => Promise<unknown> }) {}

  async withTenantTx<T>(tenantId: string, fn: (tx: { execute: (query: unknown) => Promise<unknown> }) => Promise<T>): Promise<T> {
    if (!tenantId) throw new Error('tenantId missing');
    return this.db.transaction(async (tx) => {
      await tx.execute({ sql: "SELECT set_config('app.current_tenant', $1, true)", params: [tenantId] });
      return fn(tx);
    }) as Promise<T>;
  }
}

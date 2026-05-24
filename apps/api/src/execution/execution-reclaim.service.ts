import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class ExecutionReclaimService {
  private readonly logger = new Logger(ExecutionReclaimService.name);
  static readonly SCAN_INTERVAL_MS = 15000;
  static readonly BATCH_LIMIT = 50;
  shouldRouteToDlq(reclaimCount: number, maxReclaims: number) { return reclaimCount >= maxReclaims; }
  onCasConflict(executionId: string) { this.logger.warn({ executionId, casConflict: true }); }
}

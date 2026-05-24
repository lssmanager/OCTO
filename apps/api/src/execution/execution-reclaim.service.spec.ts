import { describe, expect, it } from 'vitest';
import { ExecutionReclaimService } from './execution-reclaim.service';

describe('ExecutionReclaimService', () => {
  it('routes to dlq on max reclaims', () => {
    const svc = new ExecutionReclaimService();
    expect(svc.shouldRouteToDlq(3, 3)).toBe(true);
    expect(svc.shouldRouteToDlq(2, 3)).toBe(false);
  });
});

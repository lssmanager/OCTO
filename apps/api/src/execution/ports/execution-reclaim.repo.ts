import type { StaleExecutionRow } from '../execution-reclaim.service';

export interface ExecutionReclaimRepo {
  findStaleLeases(states: readonly string[], limit: number): Promise<StaleExecutionRow[]>;
  casReclaiming(execution: StaleExecutionRow): Promise<boolean>;
  casRouteToDlq(execution: StaleExecutionRow): Promise<boolean>;
}

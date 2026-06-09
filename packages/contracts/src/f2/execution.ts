import { z } from 'zod';

import { ExecutionStatusValues } from '../execution';

export const ExecutionStatusSchema = z.enum(
  ExecutionStatusValues as [
    (typeof ExecutionStatusValues)[number],
    ...(typeof ExecutionStatusValues)[number][],
  ]
);

export const ExecutionSourceValues = ['live', 'replay'] as const;
export const ExecutionSourceSchema = z.enum(ExecutionSourceValues);

export const ReplayExecutionModeValues = ['read_only', 'resume_live'] as const;
export const ReplayExecutionModeSchema = z.enum(ReplayExecutionModeValues);

export const BudgetStateValues = ['ok', 'pressure', 'exceeded'] as const;
export const BudgetStateSchema = z.enum(BudgetStateValues);

export type ExecutionStatus = z.infer<typeof ExecutionStatusSchema>;
export type ExecutionSource = z.infer<typeof ExecutionSourceSchema>;
export type ReplayExecutionMode = z.infer<typeof ReplayExecutionModeSchema>;
export type BudgetState = z.infer<typeof BudgetStateSchema>;

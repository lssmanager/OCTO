import { describe, expect, it } from 'vitest';
import {
  agentVersions,
  approvals,
  executionCheckpointWrites,
  executionCheckpoints,
  executionSteps,
  executions,
  outboxEvents,
  toolInvocations,
  type AgentVersion,
  type Approval,
  type Execution,
  type ExecutionCheckpoint,
  type ExecutionCheckpointWrite,
  type ExecutionStep,
  type NewAgentVersion,
  type NewApproval,
  type NewExecution,
  type NewExecutionCheckpoint,
  type NewExecutionCheckpointWrite,
  type NewExecutionStep,
  type NewOutboxEvent,
  type NewToolInvocation,
  type OutboxEvent,
  type ToolInvocation,
} from '../index';

describe('schema exports', () => {
  it('exports all F1 tables and inferred types', () => {
    expect(executions).toBeDefined();
    expect(executionSteps).toBeDefined();
    expect(executionCheckpoints).toBeDefined();
    expect(executionCheckpointWrites).toBeDefined();
    expect(agentVersions).toBeDefined();
    expect(toolInvocations).toBeDefined();
    expect(approvals).toBeDefined();
    expect(outboxEvents).toBeDefined();

    const _typeCheck: {
      e: Execution; ne: NewExecution; es: ExecutionStep; nes: NewExecutionStep;
      c: ExecutionCheckpoint; nc: NewExecutionCheckpoint;
      cw: ExecutionCheckpointWrite; ncw: NewExecutionCheckpointWrite;
      av: AgentVersion; nav: NewAgentVersion; ti: ToolInvocation; nti: NewToolInvocation;
      ap: Approval; nap: NewApproval; oe: OutboxEvent; noe: NewOutboxEvent;
    } | null = null;
    expect(_typeCheck).toBeNull();
  });
});

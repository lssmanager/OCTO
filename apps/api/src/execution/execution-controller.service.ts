import { Injectable, NotFoundException } from '@nestjs/common';

export type ExecutionSummary = {
  id: string;
  tenantId: string;
  agentId: string;
  agentVersionId: string;
  status: string;
  state: string;
  version: number;
  createdAt: Date;
  updatedAt: Date;
};

export type ExecutionTimelineEvent = {
  id: string;
  executionId: string | null;
  tenantId: string;
  eventType: string;
  payloadJson: unknown;
  createdAt: Date;
};

export type CreateExecutionRequest = {
  agentId: string;
  agentVersionId: string;
  input: Record<string, unknown>;
  traceId?: string;
  correlationId?: string;
  runId?: string;
};

@Injectable()
export class ExecutionControllerService {
  constructor(
    private readonly repo: {
      createExecution: (
        input: CreateExecutionRequest,
        tenantId: string,
        createdBy: string
      ) => Promise<{ id: string }>;
      getExecutionSummary: (
        executionId: string,
        tenantId: string
      ) => Promise<ExecutionSummary | null>;
      getExecutionTimeline: (
        executionId: string,
        tenantId: string
      ) => Promise<ExecutionTimelineEvent[]>;
      casRequestCancellation: (executionId: string, tenantId: string) => Promise<boolean>;
      casResumeSuspended: (executionId: string, tenantId: string) => Promise<boolean>;
      createOutboxEntry: (
        executionId: string,
        tenantId: string,
        command: 'cancel' | 'resume'
      ) => Promise<void>;
    }
  ) {}

  create(input: CreateExecutionRequest, tenantId: string, createdBy: string) {
    return this.repo.createExecution(input, tenantId, createdBy);
  }

  async getSummary(executionId: string, tenantId: string): Promise<ExecutionSummary> {
    const row = await this.repo.getExecutionSummary(executionId, tenantId);
    if (!row) throw new NotFoundException('execution_not_found');
    return row;
  }

  getTimeline(executionId: string, tenantId: string) {
    return this.repo.getExecutionTimeline(executionId, tenantId);
  }

  async cancel(executionId: string, tenantId: string): Promise<{ accepted: boolean }> {
    const accepted = await this.repo.casRequestCancellation(executionId, tenantId);
    if (!accepted) return { accepted: false };
    await this.repo.createOutboxEntry(executionId, tenantId, 'cancel');
    return { accepted: true };
  }

  async resume(executionId: string, tenantId: string): Promise<{ accepted: boolean }> {
    const accepted = await this.repo.casResumeSuspended(executionId, tenantId);
    if (!accepted) return { accepted: false };
    await this.repo.createOutboxEntry(executionId, tenantId, 'resume');
    return { accepted: true };
  }
}

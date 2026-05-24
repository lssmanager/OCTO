export type CreateExecutionDto = {
  agentId: string;
  agentVersionId?: string;
  input: Record<string, unknown>;
};

export interface ExecutionControllerRepo {
  dispatchTx(input: CreateExecutionDto, tenantId: string, createdBy: string): Promise<{ id: string }>;
}

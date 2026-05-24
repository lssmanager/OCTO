export interface ExecutionCommandQueue {
  add(name: string, data: Record<string, unknown>, opts: Record<string, unknown>): Promise<void>;
}

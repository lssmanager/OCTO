// Memory primitive contracts

export interface MemoryRecord {
  id: string;
  agentId: string;
  scope: MemoryScope;
  type: MemoryType;
  content: string;
  embedding?: number[];
  metadata?: Record<string, unknown>;
  linkedIds?: string[];
  createdAt: Date;
  expiresAt?: Date;
}

export type MemoryScope = 'agent' | 'workspace' | 'department' | 'agency' | 'global';

export type MemoryType = 'episodic' | 'semantic' | 'procedural' | 'contextual' | 'execution';

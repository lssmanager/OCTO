import type { OctoRequestUser } from './jwt-payload';

export type OctoRequest = {
  headers: Record<string, unknown>;
  user?: OctoRequestUser;
  tenantId?: string;
  userId?: string;
  scopes?: string[];
  roles?: string[];
  serviceId?: string;
  hierarchyContext?: Record<string, unknown>;
};

import { SetMetadata } from '@nestjs/common';

export const HIERARCHY_CONTEXT_KEY = 'hierarchy_context';

export type HierarchyContext = {
  agencyIdPath?: string;
  workspaceIdPath?: string;
};

export const HierarchyContextMeta = (ctx: HierarchyContext) => SetMetadata(HIERARCHY_CONTEXT_KEY, ctx);

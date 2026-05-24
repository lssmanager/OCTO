import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { OctoRequest } from '../types/octo-request';

export const CurrentUser = createParamDecorator((_d: unknown, ctx: ExecutionContext) => ctx.switchToHttp().getRequest<OctoRequest>().user);

import { Controller, Get } from '@nestjs/common';
import { Public } from './decorators/public.decorator';
import { JwtKeyStoreService } from './jwt-key-store.service';

@Controller('/.well-known')
export class JwksController {
  constructor(private readonly keys: JwtKeyStoreService) {}
  @Public()
  @Get('jwks.json')
  getJwks() { return this.keys.listPublicJwks(); }
}

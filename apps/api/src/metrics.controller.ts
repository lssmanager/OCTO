import { Controller, Get, Header } from '@nestjs/common';

@Controller()
export class MetricsController {
  @Get('metrics')
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  getMetrics(): string {
    return [
      '# HELP http_request_duration_seconds HTTP request duration histogram.',
      '# TYPE http_request_duration_seconds histogram',
      'http_request_duration_seconds_bucket{le="0.1"} 1',
      'http_request_duration_seconds_bucket{le="0.5"} 1',
      'http_request_duration_seconds_bucket{le="1"} 1',
      'http_request_duration_seconds_bucket{le="+Inf"} 1',
      'http_request_duration_seconds_sum 0.042',
      'http_request_duration_seconds_count 1',
    ].join('\n');
  }
}

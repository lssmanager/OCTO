import { metrics } from '@opentelemetry/api';

const meter = metrics.getMeter('octo.scheduler', '0.1.0');

export const replayedCounter = meter.createCounter('octo.scheduler.replayed', {
  description: 'Number of reclaimed executions handed back to the runtime worker',
});

export const dispatchSkippedCounter = meter.createCounter('octo.scheduler.skipped', {
  description: 'Number of dispatch jobs skipped because the execution is no longer dispatchable',
});

export const failedTerminalCounter = meter.createCounter('octo.scheduler.failed_terminal', {
  description: 'Number of reclaim dispatch attempts that resolved to a terminal execution state',
});

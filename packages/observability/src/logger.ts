import pino, { type Logger as PinoLogger } from 'pino';

export interface LoggerContext {
  service: string;
  version?: string;
}

export interface ExecutionLoggerContext {
  trace_id: string;
  execution_id?: string;
  agent_id?: string;
  run_id: string;
}

export function createLogger(context: LoggerContext): PinoLogger {
  return pino({
    level: process.env['LOG_LEVEL'] ?? 'info',
    base: {
      service: context.service,
      version: context.version ?? '0.0.1-f0',
      env: process.env['NODE_ENV'] ?? 'development',
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: {
      level: (label) => ({ level: label }),
    },
    messageKey: 'msg',
  });
}

export function createExecutionLogger(
  base: PinoLogger,
  context: ExecutionLoggerContext,
): PinoLogger {
  return base.child(context);
}
